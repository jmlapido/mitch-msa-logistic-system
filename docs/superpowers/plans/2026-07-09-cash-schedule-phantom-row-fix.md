# Cash Contract Phantom Row Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop cash rent contracts from generating phantom zero-payment `rent_payments` rows for calendar months that aren't part of the contract's dated payment schedule, and clean up the phantom rows this has already created for 6 tenants in production.

**Architecture:** Once a cash contract has at least one dated `pdc_cheques` slot, it switches from the calendar month-walk generator to the same slot-driven generator PDC contracts already use — one row per dated slot, nothing else. A one-time migration deletes existing zero-payment phantom rows using the same safe criteria the codebase already applies elsewhere (never touches a row with a real payment).

**Tech Stack:** Hono (Cloudflare Workers), D1 (SQLite), TypeScript. No test framework touches this file today (see Global Constraints).

## Global Constraints

- Never delete or alter a `rent_payments` row that has `amount_paid > 0` or any `payment_entries` recorded against it, regardless of whether its month matches a dated schedule slot.
- A cash contract with zero dated `pdc_cheques` slots must be completely unaffected by this change — it keeps the plain monthly walk exactly as today.
- `rent-payments.ts` has zero automated test coverage today and this plan does not add any (per the accepted design spec) — every verification step in this plan is a manual `wrangler d1 execute` check against the **remote** database, run with explicit confirmation before any destructive step.
- Migration files in this repo carry a header comment with the exact `npx wrangler d1 execute mitch-app-db --remote --file=...` command and a note that it must be run manually, once, after merge+deploy — never automatically (see `migrations/0012-cash-payment-count-migration.sql` for the exact convention to match).

---

### Task 1: Fix the generation queries in `src/routes/rent-payments.ts`

**Files:**
- Modify: `src/routes/rent-payments.ts:66-98`

**Interfaces:**
- Consumes: nothing new — this task only edits SQL text inside the existing `GET /` handler in `rentPayments.get('/', async (c) => { ... })`. No function signatures change.
- Produces: the two `INSERT` queries described below, for Task 2 (migration) to reason about consistently — the migration in Task 2 must delete rows that this task's guard would now refuse to regenerate, so both tasks must agree on the exact `NOT EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL)` condition.

- [ ] **Step 1: Read the current two queries to confirm exact current text**

Run: `sed -n '66,98p' src/routes/rent-payments.ts` (or open the file at those lines). Confirm it matches exactly:

```ts
  await c.env.DB.prepare(`
    WITH RECURSIVE month_gen(m) AS (
      SELECT strftime('%Y-%m', MIN(start_date)) FROM contracts
      UNION ALL
      SELECT strftime('%Y-%m', m || '-01', '+1 month')
      FROM month_gen WHERE m < ?
    )
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT c.id, mg.m,
      ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2),
      'pending'
    FROM contracts c
    CROSS JOIN month_gen mg
    WHERE date(c.start_date) <= mg.m || '-28'
      AND date(c.end_date) >= mg.m || '-01'
      AND mg.m <= ?
      AND c.payment_type = 'cash'
  `).bind(month, month).run();

  // Custom frequency: generate one rent_payment per pdc_cheques entry
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT
      c.id,
      strftime('%Y-%m', pc.cheque_date),
      ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2),
      'pending'
    FROM contracts c
    JOIN pdc_cheques pc ON pc.contract_id = c.id
    WHERE (c.payment_frequency = 'custom' OR c.payment_type = 'pdc')
      AND pc.cheque_date IS NOT NULL
      AND strftime('%Y-%m', pc.cheque_date) <= ?
  `).bind(month).run();
```

If the file has drifted from this text (e.g., due to other merged work), stop and report the actual current content — do not proceed with a stale diff.

- [ ] **Step 2: Add the `NOT EXISTS` guard to the calendar month-walk query**

Replace the first query's `WHERE` clause (inside the `INSERT OR IGNORE INTO rent_payments ... FROM contracts c CROSS JOIN month_gen mg WHERE ...` block) so it reads:

```ts
  await c.env.DB.prepare(`
    WITH RECURSIVE month_gen(m) AS (
      SELECT strftime('%Y-%m', MIN(start_date)) FROM contracts
      UNION ALL
      SELECT strftime('%Y-%m', m || '-01', '+1 month')
      FROM month_gen WHERE m < ?
    )
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT c.id, mg.m,
      ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2),
      'pending'
    FROM contracts c
    CROSS JOIN month_gen mg
    WHERE date(c.start_date) <= mg.m || '-28'
      AND date(c.end_date) >= mg.m || '-01'
      AND mg.m <= ?
      AND c.payment_type = 'cash'
      AND NOT EXISTS (
        SELECT 1 FROM pdc_cheques pc
        WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL
      )
  `).bind(month, month).run();
```

Only the added `AND NOT EXISTS (...)` clause is new; every other line is unchanged from Step 1.

- [ ] **Step 3: Widen the slot-driven query's gate to include cash, and switch its divisor**

The slot-driven query already uses the dated-slot-count divisor (`MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL))`) — no divisor change is needed, only the `WHERE` gate. Replace the second query so it reads:

```ts
  // Custom frequency and cash-with-schedule: generate one rent_payment per dated pdc_cheques entry
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT
      c.id,
      strftime('%Y-%m', pc.cheque_date),
      ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2),
      'pending'
    FROM contracts c
    JOIN pdc_cheques pc ON pc.contract_id = c.id
    WHERE (c.payment_frequency = 'custom' OR c.payment_type = 'pdc' OR c.payment_type = 'cash')
      AND pc.cheque_date IS NOT NULL
      AND strftime('%Y-%m', pc.cheque_date) <= ?
  `).bind(month).run();
```

Only the `WHERE` clause's `OR c.payment_type = 'cash'` is new and the comment is updated; the `SELECT` list, `FROM`/`JOIN`, and divisor formula are unchanged from Step 1.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: one pre-existing, unrelated error in `src/middleware/requireRole.test.ts` (`TS2769` about a `Map` overload) — this predates this change and is not something to fix here. No new errors should appear referencing `src/routes/rent-payments.ts` (this is a pure SQL-string change inside an existing handler, so no type surface changes).

- [ ] **Step 5: Manual verification against remote D1 (read-only, no writes yet)**

This step verifies the new guard logic is correct *before* deploying, by simulating it as a read-only query against production data. Run:

```bash
npx wrangler d1 execute mitch-app-db --remote --command "SELECT c.id, t.name FROM contracts c JOIN tenants t ON c.tenant_id=t.id WHERE c.payment_type='cash' AND EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id=c.id AND pc.cheque_date IS NOT NULL);"
```

Expected: returns the list of cash contracts that will switch to slot-driven generation once this deploys (contract_id=62 "Elsayed Emam Abdelnabbi Awwad" must be in this list, along with ANNAS HUSSAIN, MABROOK TRAVEL LLC, AL RIAH FURNITURE, MOHAMMED SAIFUL ISLAM ABDUL RAZZAK, MARILOU QUINES MALLARE — 6 contracts total per the design doc's live scan). Confirm no *other* cash contract unexpectedly appears in this list (which would mean it has a stray dated slot you didn't expect and would also switch behavior).

- [ ] **Step 6: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "fix: stop generating phantom monthly rows for cash contracts with a dated schedule"
```

---

### Task 2: Cleanup migration for existing phantom rows

**Files:**
- Create: `migrations/0014-cash-phantom-row-cleanup.sql`

**Interfaces:**
- Consumes: the same `NOT EXISTS`/`EXISTS` condition shape introduced in Task 1 Step 2 (a cash contract "has a dated schedule" iff `EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL)`) — this migration's `DELETE` must only touch contracts matching that same condition, so a row Task 1's code would now refuse to regenerate is exactly a row this migration is allowed to remove.
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Write the migration file**

Create `migrations/0014-cash-phantom-row-cleanup.sql` with this exact content:

```sql
-- PRODUCTION: this migration must be applied to the remote D1 database exactly
-- once, after this branch has merged and deployed, via:
--   npx wrangler d1 execute mitch-app-db --remote --file=migrations/0014-cash-phantom-row-cleanup.sql
-- Only run this with explicit human confirmation -- never automatically.

-- migrations/0014-cash-phantom-row-cleanup.sql
-- Removes phantom rent_payments rows created by the pre-fix calendar month-walk
-- for cash contracts that have a dated payment schedule: rows whose month
-- doesn't correspond to any dated pdc_cheques slot, have zero amount paid,
-- and have zero payment_entries ever recorded against them. Rows with any
-- real payment history are never touched, regardless of schedule match.

DELETE FROM rent_payments
WHERE id IN (
  SELECT rp.id FROM rent_payments rp
  JOIN contracts c ON rp.contract_id = c.id
  WHERE c.payment_type = 'cash'
    AND rp.amount_paid = 0
    AND rp.status IN ('pending', 'overdue')
    AND EXISTS (
      SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM pdc_cheques pc
      WHERE pc.contract_id = c.id AND strftime('%Y-%m', pc.cheque_date) = rp.month
    )
    AND NOT EXISTS (
      SELECT 1 FROM payment_entries pe WHERE pe.rent_payment_id = rp.id
    )
);
```

- [ ] **Step 2: Dry-run the migration as a SELECT against remote D1 — do not delete yet**

Run this read-only variant to see exactly which rows would be deleted, before running the real migration:

```bash
npx wrangler d1 execute mitch-app-db --remote --command "SELECT rp.id, c.id as contract_id, t.name, rp.month, rp.amount FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id JOIN tenants t ON c.tenant_id = t.id WHERE c.payment_type = 'cash' AND rp.amount_paid = 0 AND rp.status IN ('pending', 'overdue') AND EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND strftime('%Y-%m', pc.cheque_date) = rp.month) AND NOT EXISTS (SELECT 1 FROM payment_entries pe WHERE pe.rent_payment_id = rp.id) ORDER BY c.id, rp.month;"
```

Expected: approximately 34 rows total (7 Elsayed + 3 ANNAS HUSSAIN + 6 MABROOK TRAVEL LLC + 8 AL RIAH FURNITURE + 9 MOHAMMED SAIFUL ISLAM ABDUL RAZZAK + 1 MARILOU QUINES MALLARE, per the design doc's live scan), all with `amount = 0`-paid rows only. If any row unexpectedly has `amount_paid > 0`, STOP — the query has a bug, since this violates the Global Constraint that no row with real payment history is ever touched. Do not proceed to Step 3 until every returned row is confirmed zero-paid and matches one of the 6 named tenants (or a newly-onboarded cash-with-schedule contract created since this plan was written — inspect any surprise contract by name before proceeding).

- [ ] **Step 3: Apply the migration to remote D1**

Only after Step 2's dry-run output has been manually reviewed and confirmed safe:

```bash
npx wrangler d1 execute mitch-app-db --remote --file=migrations/0014-cash-phantom-row-cleanup.sql
```

Expected output includes `"changes": <N>` matching the row count from Step 2's dry-run.

- [ ] **Step 4: Verify each affected tenant's Overdue total dropped correctly**

Run, for the primary reported case:

```bash
npx wrangler d1 execute mitch-app-db --remote --command "SELECT rp.id, rp.month, rp.amount, rp.amount_paid, rp.status FROM rent_payments rp WHERE rp.contract_id = 62 ORDER BY rp.month;"
```

Expected: only rows for months `2026-03` (amount 3000) and `2026-07` (amount 7500) remain from the pre-existing set (plus any months at or after whatever the current live month is, if new slot-driven rows have since been generated by Task 1's code for Aug/Sep/Oct 2026) — none of the 7 previously-phantom months (2025-10 through 2025-12, 2026-01, 2026-02, 2026-04, 2026-06) appear anymore.

Then confirm live on the Payments page (navigate to `https://msa.jmlapido.com/rentals`, Payments tab, July 2026, Saeed Plaza): Elsayed Emam Abdelnabbi Awwad's Overdue column no longer reads 25,400.00.

- [ ] **Step 5: Commit**

```bash
git add migrations/0014-cash-phantom-row-cleanup.sql
git commit -m "fix: clean up phantom cash-contract rent rows created before the schedule-driven generation fix"
```
