# Rent Overpayment Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a rent payment entry exceeds what's due for the month it's recorded against, automatically sweep the excess to the tenant's oldest outstanding unpaid/partial/overdue month across all of their contracts, leaving a traceable, cascade-deletable entry trail.

**Architecture:** A new pure function (`planOverpaymentSweep`) computes the split between "stays on the row you recorded it against" and "sweeps to older debt" using plain numbers — fully unit-testable with no DB. The `POST /rent-payments/:id/entries` route fetches the target row and candidate rows from D1, calls the pure function, then writes the resulting entries. A new nullable `source_entry_id` column on `payment_entries` links auto-generated entries back to the entry that produced them, so `DELETE /rent-payments/:id/entries/:entryId` can cascade-delete swept entries when their originating entry is removed.

**Tech Stack:** Hono + Cloudflare D1 (SQLite) backend (`src/routes/rent-payments.ts`), Vitest for pure-function tests, React Query on the frontend (no frontend logic changes needed beyond one type field).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-rent-overpayment-rollover-design.md` — follow it exactly; this plan implements it task-by-task.
- No behavior change when a payment doesn't exceed what's due for its own row (existing code path must stay byte-for-byte equivalent).
- Sweep candidates are ordered `month ASC, id ASC` (deterministic across contracts) and drawn from **all** of the tenant's contracts, not just the one being paid.
- Auto-generated entries: `receipt_no = NULL`, `notes = "Auto-applied from overpayment recorded on {paid_date}"`, `source_entry_id` = the originating entry's id.
- Out of scope (do not build): tenant-level credit balances, bill-payment (`bill_entries`) changes, editing existing entries, toast copy changes.

---

### Task 1: Add `source_entry_id` column via migration

**Files:**
- Create: `migrations/0012-payment-entry-source.sql`

**Interfaces:**
- Produces: `payment_entries.source_entry_id` (INTEGER, nullable, references `payment_entries(id)`) — used by Task 3 (writes) and Task 4 (cascade delete).

- [ ] **Step 1: Write the migration file**

```sql
-- Link auto-swept overpayment entries back to the entry that produced them
ALTER TABLE payment_entries ADD COLUMN source_entry_id INTEGER REFERENCES payment_entries(id);
```

- [ ] **Step 2: Apply it to the local D1 database**

Run: `npx wrangler d1 execute mitch-app-db --local --file=migrations/0012-payment-entry-source.sql`
Expected: command completes with no error output (D1 prints a success summary).

- [ ] **Step 3: Verify the column exists**

Run: `npx wrangler d1 execute mitch-app-db --local --command="PRAGMA table_info(payment_entries);"`
Expected: the output rows include a row with `name` = `source_entry_id`.

- [ ] **Step 4: Commit**

```bash
git add migrations/0012-payment-entry-source.sql
git commit -m "feat: add source_entry_id column for overpayment sweep tracking"
```

---

### Task 2: Pure sweep-planning function + tests

**Files:**
- Create: `src/lib/paymentSweep.ts`
- Test: `src/lib/paymentSweep.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type OutstandingRow = { id: number; expectedRent: number; amountPaid: number };
  export type SweepPlan = { targetAmount: number; swept: Array<{ rentPaymentId: number; amount: number }> };
  export function planOverpaymentSweep(
    enteredAmount: number,
    targetExpectedRent: number,
    targetAmountPaid: number,
    otherOutstanding: OutstandingRow[], // must already be sorted oldest-first (month ASC, id ASC) by the caller
  ): SweepPlan
  ```
  Consumed by Task 3's route handler.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/paymentSweep.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { planOverpaymentSweep } from './paymentSweep';

describe('planOverpaymentSweep', () => {
  it('exact match: no excess, no sweep', () => {
    const plan = planOverpaymentSweep(400, 400, 0, []);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([]);
  });

  it('overpayment fully clears one older unpaid month', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 7, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 7, amount: 100 }]);
  });

  it('overpayment spans two older months, oldest first, no leftover', () => {
    const plan = planOverpaymentSweep(550, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 50 }, // May, remaining 50
      { id: 6, expectedRent: 100, amountPaid: 0 },  // June, remaining 100
    ]);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([
      { rentPaymentId: 5, amount: 50 },
      { rentPaymentId: 6, amount: 100 },
    ]);
  });

  it('overpayment exceeds all existing debt: leftover stays on target', () => {
    const plan = planOverpaymentSweep(1000, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(900); // 400 own + 500 leftover after clearing the 100 debt
    expect(plan.swept).toEqual([{ rentPaymentId: 5, amount: 100 }]);
  });

  it('target row already partially paid: only its remaining due is its own share', () => {
    const plan = planOverpaymentSweep(300, 400, 250, [
      { id: 9, expectedRent: 100, amountPaid: 0 },
    ]);
    // target owes 150 more; entered 300 covers that (150) + sweeps 100 to row 9 + 50 leftover back to target
    expect(plan.targetAmount).toBe(200); // 150 own share + 50 leftover
    expect(plan.swept).toEqual([{ rentPaymentId: 9, amount: 100 }]);
  });

  it('candidate rows with zero remaining due are skipped', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 3, expectedRent: 100, amountPaid: 100 }, // already fully paid, must be skipped
      { id: 4, expectedRent: 50, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(450); // 400 own + 50 leftover (100-50=50 excess, 50 goes to row 4, 50 leftover)
    expect(plan.swept).toEqual([{ rentPaymentId: 4, amount: 50 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/paymentSweep.test.ts`
Expected: FAIL — `Cannot find module './paymentSweep'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/paymentSweep.ts`:

```typescript
export type OutstandingRow = {
  id: number;
  expectedRent: number;
  amountPaid: number;
};

export type SweepPlan = {
  targetAmount: number;
  swept: Array<{ rentPaymentId: number; amount: number }>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * otherOutstanding must already be sorted oldest-first (month ASC, id ASC) by the caller —
 * this function applies excess in the order given, it does not re-sort.
 */
export function planOverpaymentSweep(
  enteredAmount: number,
  targetExpectedRent: number,
  targetAmountPaid: number,
  otherOutstanding: OutstandingRow[],
): SweepPlan {
  const remainingDueTarget = Math.max(0, round2(targetExpectedRent - targetAmountPaid));
  let targetAmount = Math.min(enteredAmount, remainingDueTarget);
  let excess = round2(enteredAmount - targetAmount);

  const swept: Array<{ rentPaymentId: number; amount: number }> = [];

  for (const row of otherOutstanding) {
    if (excess <= 0) break;
    const remainingDue = Math.max(0, round2(row.expectedRent - row.amountPaid));
    if (remainingDue <= 0) continue;
    const applyAmount = Math.min(excess, remainingDue);
    swept.push({ rentPaymentId: row.id, amount: applyAmount });
    excess = round2(excess - applyAmount);
  }

  targetAmount = round2(targetAmount + excess);

  return { targetAmount, swept };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/paymentSweep.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentSweep.ts src/lib/paymentSweep.test.ts
git commit -m "feat: add pure overpayment-sweep planning function"
```

---

### Task 3: Wire the sweep into `POST /rent-payments/:id/entries`

**Files:**
- Modify: `src/routes/rent-payments.ts:279-300` (the `rentPayments.post('/:id/entries', ...)` handler)
- Modify: `client/src/lib/hooks/useRentals.ts:10-20` (the `PaymentEntry` type)

**Interfaces:**
- Consumes: `planOverpaymentSweep(enteredAmount, targetExpectedRent, targetAmountPaid, otherOutstanding)` from Task 2, and the existing `recomputePaymentStatus(db, rentPaymentId)` and `auditLog(db, user, action, entityType, entityId, details)` already defined/imported in `src/routes/rent-payments.ts`.
- Produces: `payment_entries` rows may now include `source_entry_id`; consumed by Task 4's cascade-delete logic.

- [ ] **Step 1: Read the current handler to confirm line numbers before editing**

Run: `sed -n '279,300p' src/routes/rent-payments.ts` (or open the file) — confirm it still matches:

```typescript
rentPayments.post('/:id/entries', zv('json', addEntrySchema), async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const d = c.req.valid('json');

  // Verify parent exists
  const parent = await c.env.DB.prepare('SELECT id FROM rent_payments WHERE id = ?').bind(rentPaymentId).first();
  if (!parent) return c.json({ error: 'Payment not found' }, 404);

  const now = new Date().toISOString();
  const entry = await c.env.DB.prepare(
    `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    rentPaymentId, d.amount, d.paid_date, d.payment_method,
    d.receipt_no ?? null, d.notes ?? null, String(user.sub), now
  ).first();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_added', 'payment', rentPaymentId,
    `Added ${d.amount} on ${d.paid_date}`);
  return c.json(entry, 201);
});
```

- [ ] **Step 2: Add the import** at the top of `src/routes/rent-payments.ts` (near the other imports, after `import { auditLog } from '../lib/auditLog';`):

```typescript
import { planOverpaymentSweep, type OutstandingRow } from '../lib/paymentSweep';
```

- [ ] **Step 3: Replace the handler body**

Replace the whole `rentPayments.post('/:id/entries', ...)` block (currently lines 279-300) with:

```typescript
rentPayments.post('/:id/entries', zv('json', addEntrySchema), async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const parent = await c.env.DB.prepare('SELECT id FROM rent_payments WHERE id = ?').bind(rentPaymentId).first();
  if (!parent) return c.json({ error: 'Payment not found' }, 404);

  const expectedRentSql = `
    COALESCE(
      CASE WHEN c.payment_type = 'pdc' THEN pc.amount ELSE NULL END,
      CASE
        WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
        WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
        WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
        WHEN c.payment_frequency = 'custom'      THEN
          ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(c.annual_rent / 12.0, 2)
      END
    )`;

  const target = await c.env.DB.prepare(`
    SELECT rp.month, c.tenant_id, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id AND c.payment_type = 'pdc'
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; tenant_id: number; expected_rent: number; amount_paid: number }>();

  const { results: candidateRows } = await c.env.DB.prepare(`
    SELECT rp.id, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id AND c.payment_type = 'pdc'
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE c.tenant_id = ? AND rp.id != ? AND rp.status IN ('pending', 'overdue', 'partial')
    ORDER BY rp.month ASC, rp.id ASC
  `).bind(target!.tenant_id, rentPaymentId).all<{ id: number; expected_rent: number; amount_paid: number }>();

  const otherOutstanding: OutstandingRow[] = candidateRows.map(r => ({
    id: r.id, expectedRent: r.expected_rent, amountPaid: r.amount_paid,
  }));

  const plan = planOverpaymentSweep(d.amount, target!.expected_rent, target!.amount_paid, otherOutstanding);

  const now = new Date().toISOString();
  const entry = await c.env.DB.prepare(
    `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
     VALUES (?,?,?,?,?,?,?,?,NULL) RETURNING *`
  ).bind(
    rentPaymentId, plan.targetAmount, d.paid_date, d.payment_method,
    d.receipt_no ?? null, d.notes ?? null, String(user.sub), now
  ).first<{ id: number }>();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_added', 'payment', rentPaymentId,
    `Added ${plan.targetAmount} on ${d.paid_date}`);

  for (const swept of plan.swept) {
    await c.env.DB.prepare(
      `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
       VALUES (?,?,?,?,NULL,?,?,?,?)`
    ).bind(
      swept.rentPaymentId, swept.amount, d.paid_date, d.payment_method,
      `Auto-applied from overpayment recorded on ${d.paid_date}`, String(user.sub), now, entry!.id
    ).run();
    await recomputePaymentStatus(c.env.DB, swept.rentPaymentId);
    await auditLog(c.env.DB, user, 'payment.auto_applied', 'payment', swept.rentPaymentId,
      `Applied ${swept.amount} from overpayment on rent_payment #${rentPaymentId}`);
  }

  return c.json(entry, 201);
});
```

- [ ] **Step 4: Update the frontend `PaymentEntry` type**

In `client/src/lib/hooks/useRentals.ts`, change (around line 10-20):

```typescript
export type PaymentEntry = {
  id: number;
  rent_payment_id: number;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque' | null;
  receipt_no: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
};
```

to:

```typescript
export type PaymentEntry = {
  id: number;
  rent_payment_id: number;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque' | null;
  receipt_no: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
  source_entry_id: number | null;
};
```

- [ ] **Step 5: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no TypeScript errors, all existing tests still pass (the 5 existing test files plus the 6 new `paymentSweep.test.ts` tests from Task 2).

- [ ] **Step 6: Manual verification against local D1**

Run: `npx wrangler dev` in one terminal, then in another:

```bash
# Adjust IDs to match real rows in your local DB — use `npx wrangler d1 execute mitch-app-db --local --command="SELECT id, contract_id, month, status FROM rent_payments ORDER BY month;"` to find a tenant with an overdue June row and a pending July row for the same contract/tenant.
curl -s -X POST http://localhost:8787/api/rent-payments/<JULY_ROW_ID>/entries \
  -H "Content-Type: application/json" -b "token=<a valid session cookie>" \
  -d '{"amount": 500, "paid_date": "2026-07-15", "payment_method": "cheque"}'
```

Expected: JSON response for the July entry with `amount` capped at July's own due; then:

```bash
curl -s http://localhost:8787/api/rent-payments/<JUNE_ROW_ID>/entries -b "token=<a valid session cookie>"
```

Expected: shows a new entry with `notes` starting `"Auto-applied from overpayment recorded on 2026-07-15"` and `source_entry_id` set to the July entry's id.

- [ ] **Step 7: Commit**

```bash
git add src/routes/rent-payments.ts client/src/lib/hooks/useRentals.ts
git commit -m "feat: sweep rent overpayment to tenant's oldest outstanding month"
```

---

### Task 4: Cascade-delete swept entries on `DELETE /rent-payments/:id/entries/:entryId`

**Files:**
- Modify: `src/routes/rent-payments.ts:302-313` (the `rentPayments.delete('/:id/entries/:entryId', ...)` handler)

**Interfaces:**
- Consumes: `recomputePaymentStatus(db, rentPaymentId)` and `auditLog(...)`, already in scope in this file; `payment_entries.source_entry_id` from Task 1.

- [ ] **Step 1: Read the current handler to confirm it still matches**

```typescript
rentPayments.delete('/:id/entries/:entryId', async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const entryId = Number(c.req.param('entryId'));
  const result = await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ? AND rent_payment_id = ?')
    .bind(entryId, rentPaymentId).run();
  if (result.meta.changes === 0) return c.json({ error: 'Entry not found' }, 404);
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_deleted', 'payment', rentPaymentId,
    `Deleted entry ${entryId}`);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Replace it with the cascading version**

```typescript
rentPayments.delete('/:id/entries/:entryId', async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const entryId = Number(c.req.param('entryId'));

  const { results: children } = await c.env.DB.prepare(
    'SELECT id, rent_payment_id, amount FROM payment_entries WHERE source_entry_id = ?'
  ).bind(entryId).all<{ id: number; rent_payment_id: number; amount: number }>();

  const result = await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ? AND rent_payment_id = ?')
    .bind(entryId, rentPaymentId).run();
  if (result.meta.changes === 0) return c.json({ error: 'Entry not found' }, 404);

  for (const child of children) {
    await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ?').bind(child.id).run();
    await recomputePaymentStatus(c.env.DB, child.rent_payment_id);
    await auditLog(c.env.DB, user, 'payment.auto_applied_reversed', 'payment', child.rent_payment_id,
      `Reversed ${child.amount} auto-applied from entry ${entryId}`);
  }

  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_deleted', 'payment', rentPaymentId,
    `Deleted entry ${entryId}`);
  return c.json({ ok: true });
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification against local D1**

Continuing from Task 3 Step 6 (July entry created 100 swept to June):

```bash
curl -s -X DELETE http://localhost:8787/api/rent-payments/<JULY_ROW_ID>/entries/<JULY_ENTRY_ID> -b "token=<a valid session cookie>"
```

Expected: `{"ok":true}`. Then:

```bash
npx wrangler d1 execute mitch-app-db --local --command="SELECT id, rent_payment_id, amount, source_entry_id FROM payment_entries WHERE rent_payment_id = <JUNE_ROW_ID>;"
```

Expected: no rows returned — the swept June entry was deleted along with its parent. Also verify:

```bash
npx wrangler d1 execute mitch-app-db --local --command="SELECT id, status, amount_paid FROM rent_payments WHERE id IN (<JULY_ROW_ID>, <JUNE_ROW_ID>);"
```

Expected: both rows reverted to their pre-payment status (`overdue`/`pending`) with `amount_paid = 0`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: cascade-delete swept entries when their source entry is removed"
```

---

## Self-Review Notes

- **Spec coverage:** Migration (Task 1) ✓, sweep algorithm (Task 2) ✓, `POST /:id/entries` wiring incl. audit logs (Task 3) ✓, frontend type (Task 3 step 4) ✓, cascade delete incl. audit logs (Task 4) ✓, manual verification of both routes (Task 3 step 6, Task 4 step 4) stands in for the automated route-level tests the spec's Testing section describes — this repo has zero existing precedent for mocking `D1Database` in tests (checked: `auth.test.ts` and `requireRole.test.ts` are the only backend tests, both pure-logic, no DB), so route-level DB behavior is verified manually via `wrangler dev` + `curl` rather than inventing new test infrastructure, while the actual risky arithmetic (the cascade/leftover logic) is fully covered by Task 2's pure-function tests.
- **Placeholder scan:** no TBD/TODO; all steps have complete, runnable code or commands.
- **Type consistency:** `OutstandingRow`/`SweepPlan` from Task 2 match the import and usage in Task 3 exactly; `source_entry_id` name is consistent across the migration (Task 1), the route (Tasks 3-4), and the frontend type (Task 3).
