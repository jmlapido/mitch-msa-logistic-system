# Overpayment Forward Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing overpayment sweep so that, after clearing all past overdue debt (unchanged), remaining leftover cascades forward to pre-pay the tenant's upcoming months — across all their cash contracts — generating `rent_payments` rows on demand where none exist yet, and give every swept entry (backward or forward) a note naming its origin month and unit.

**Architecture:** `src/lib/paymentSweep.ts` gets a small refactor (extract `applyExcessToCandidate`, change `planOverpaymentSweep`'s return shape to expose `leftover` explicitly instead of silently gluing it back onto the target) plus one new pure helper (`addMonthToYyyyMm`). `src/routes/rent-payments.ts`'s `POST /:id/entries` handler gains a forward-generation loop that runs only when `plan.leftover > 0`, walking forward month-by-month across the tenant's cash contracts (nearest month first, across contracts), generating a `rent_payments` row only for a month that has no existing row at all (critical: skips any month that already has a row, since the unchanged backward-sweep query already considered it), applying leftover to it, and continuing until leftover is exhausted or every contract reaches its own `end_date`.

**Tech Stack:** Hono + D1 (SQLite) backend, Vitest for unit tests. No frontend changes.

## Global Constraints

- `planOverpaymentSweep`'s new return shape: `{ ownAmount: number; swept: Array<{rentPaymentId, amount}>; leftover: number }` — replaces today's `{ targetAmount, swept }`.
- The forward loop only ever creates rows for `payment_type = 'cash'` contracts. PDC/custom contracts are never speculatively generated — if a future PDC row already exists (because a cheque was already dated), it's already picked up by the unchanged backward-sweep query (no special handling needed).
- The forward loop must check for an existing `rent_payments` row before generating one for any (contract, month) pair — skip forward without consuming leftover if one already exists. This is the fix for a double-application bug found while writing this plan (see the design doc's "Why the existence check matters" section).
- Every swept entry's `notes` (both backward and forward) reads `Auto-applied from overpayment on {origin_month_label} (Unit {origin_unit_no})` where the origin is always the row being overpaid (the `target` row), not the destination row.
- No new database columns or migrations — reuses the existing `payment_entries.source_entry_id` column.
- No transactional/atomicity guarantees beyond the already-accepted non-transactional pattern documented in the existing `NOTE:` comment above `POST /:id/entries`.
- Baseline note: `npx tsc --noEmit -p client/tsconfig.json` reports 25 lines of pre-existing errors unrelated to this feature; root `tsconfig.json` reports 1 pre-existing error (`src/middleware/requireRole.test.ts`). Every type-check step in this plan means "no *new* errors beyond that baseline."
- This codebase has no D1-backed backend test infrastructure — verification for the route-level (DB-touching) logic is manual, consistent with every prior backend feature in this project. Only the pure functions in `paymentSweep.ts` get automated tests.

---

### Task 1: Refactor `paymentSweep.ts` — extract `applyExcessToCandidate`, change return shape

**Files:**
- Modify: `src/lib/paymentSweep.ts`
- Modify: `src/lib/paymentSweep.test.ts`

**Interfaces:**
- Produces: `applyExcessToCandidate(excess: number, expectedRent: number, amountPaid: number): { applied: number; remainingExcess: number }` — exported from `src/lib/paymentSweep.ts`. Task 3 imports this.
- Produces: `SweepPlan = { ownAmount: number; swept: Array<{ rentPaymentId: number; amount: number }>; leftover: number }` — the changed return shape of `planOverpaymentSweep`, exported from the same file. Task 3 consumes this shape at its `POST /:id/entries` call site.

- [ ] **Step 1: Update the test file to the new shape (TDD — this makes the suite fail first)**

Replace the full content of `src/lib/paymentSweep.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planOverpaymentSweep, applyExcessToCandidate } from './paymentSweep';

describe('applyExcessToCandidate', () => {
  it('applies the full excess when it is less than the remaining due', () => {
    const result = applyExcessToCandidate(50, 100, 0);
    expect(result).toEqual({ applied: 50, remainingExcess: 0 });
  });

  it('caps the applied amount at the remaining due, carrying the rest forward', () => {
    const result = applyExcessToCandidate(150, 100, 0);
    expect(result).toEqual({ applied: 100, remainingExcess: 50 });
  });

  it('applies nothing when the candidate has no remaining due', () => {
    const result = applyExcessToCandidate(100, 100, 100);
    expect(result).toEqual({ applied: 0, remainingExcess: 100 });
  });

  it('accounts for a candidate that is already partially paid', () => {
    const result = applyExcessToCandidate(80, 100, 60);
    expect(result).toEqual({ applied: 40, remainingExcess: 40 });
  });
});

describe('planOverpaymentSweep', () => {
  it('exact match: no excess, no sweep', () => {
    const plan = planOverpaymentSweep(400, 400, 0, []);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment fully clears one older unpaid month', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 7, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 7, amount: 100 }]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment spans two older months, oldest first, no leftover', () => {
    const plan = planOverpaymentSweep(550, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 50 }, // May, remaining 50
      { id: 6, expectedRent: 100, amountPaid: 0 },  // June, remaining 100
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([
      { rentPaymentId: 5, amount: 50 },
      { rentPaymentId: 6, amount: 100 },
    ]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment exceeds all existing debt: leftover is reported, not glued to target', () => {
    const plan = planOverpaymentSweep(1000, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 5, amount: 100 }]);
    expect(plan.leftover).toBe(500);
  });

  it('target row already partially paid: only its remaining due is its own share', () => {
    const plan = planOverpaymentSweep(300, 400, 250, [
      { id: 9, expectedRent: 100, amountPaid: 0 },
    ]);
    // target owes 150 more; entered 300 covers that (150) + sweeps 100 to row 9 + 50 leftover
    expect(plan.ownAmount).toBe(150);
    expect(plan.swept).toEqual([{ rentPaymentId: 9, amount: 100 }]);
    expect(plan.leftover).toBe(50);
  });

  it('candidate rows with zero remaining due are skipped', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 3, expectedRent: 100, amountPaid: 100 }, // already fully paid, must be skipped
      { id: 4, expectedRent: 50, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 4, amount: 50 }]);
    expect(plan.leftover).toBe(50);
  });

  it('no-excess payment with more than 2 decimal places passes through unrounded', () => {
    const plan = planOverpaymentSweep(100.126, 400, 0, []);
    expect(plan.ownAmount).toBe(100.126);
    expect(plan.swept).toEqual([]);
    expect(plan.leftover).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- paymentSweep.test`
Expected: FAIL — `applyExcessToCandidate` is not exported yet, and `plan.ownAmount`/`plan.leftover` are `undefined` (the current code only returns `targetAmount`).

- [ ] **Step 3: Implement the refactor**

Replace the full content of `src/lib/paymentSweep.ts`:

```ts
export type OutstandingRow = {
  id: number;
  expectedRent: number;
  amountPaid: number;
};

export type SweepPlan = {
  ownAmount: number;
  swept: Array<{ rentPaymentId: number; amount: number }>;
  leftover: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyExcessToCandidate(
  excess: number,
  expectedRent: number,
  amountPaid: number,
): { applied: number; remainingExcess: number } {
  const remainingDue = Math.max(0, round2(expectedRent - amountPaid));
  const applied = Math.min(excess, remainingDue);
  return { applied, remainingExcess: round2(excess - applied) };
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
  const ownAmount = Math.min(enteredAmount, remainingDueTarget);
  let excess = round2(enteredAmount - ownAmount);

  const swept: Array<{ rentPaymentId: number; amount: number }> = [];

  for (const row of otherOutstanding) {
    if (excess <= 0) break;
    const { applied, remainingExcess } = applyExcessToCandidate(excess, row.expectedRent, row.amountPaid);
    if (applied > 0) swept.push({ rentPaymentId: row.id, amount: applied });
    excess = remainingExcess;
  }

  return { ownAmount, swept, leftover: excess };
}

/** '2026-07' -> '2026-08'; correctly rolls over the year ('2025-12' -> '2026-01'). */
export function addMonthToYyyyMm(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(year, m); // m is already 1-indexed (e.g. 7 = July); passing it as the month index (0-indexed) yields the next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- paymentSweep.test`
Expected: PASS — all 11 test cases green (4 for `applyExcessToCandidate`, 7 for `planOverpaymentSweep`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentSweep.ts src/lib/paymentSweep.test.ts
git commit -m "refactor: extract applyExcessToCandidate, expose leftover explicitly in SweepPlan"
```

---

### Task 2: Add `addMonthToYyyyMm` tests

**Files:**
- Modify: `src/lib/paymentSweep.test.ts`

**Interfaces:**
- Consumes: `addMonthToYyyyMm` from `src/lib/paymentSweep.ts` (added in Task 1, Step 3, but not yet tested — this task adds its tests as a separate, reviewable unit since it's a distinct piece of new pure logic).

- [ ] **Step 1: Write the tests**

Add to `src/lib/paymentSweep.test.ts` (after the `planOverpaymentSweep` describe block, updating the import line at the top):

```ts
import { describe, it, expect } from 'vitest';
import { planOverpaymentSweep, applyExcessToCandidate, addMonthToYyyyMm } from './paymentSweep';
```

```ts
describe('addMonthToYyyyMm', () => {
  it('steps forward within a year', () => {
    expect(addMonthToYyyyMm('2026-07')).toBe('2026-08');
  });

  it('rolls over into the next year at December', () => {
    expect(addMonthToYyyyMm('2025-12')).toBe('2026-01');
  });

  it('zero-pads single-digit months', () => {
    expect(addMonthToYyyyMm('2026-01')).toBe('2026-02');
    expect(addMonthToYyyyMm('2026-09')).toBe('2026-10');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- paymentSweep.test`
Expected: PASS — all 14 test cases green (4 + 7 from Task 1, plus 3 new for `addMonthToYyyyMm`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/paymentSweep.test.ts
git commit -m "test: add coverage for addMonthToYyyyMm"
```

---

### Task 3: Wire the new `SweepPlan` shape into `POST /:id/entries`

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Interfaces:**
- Consumes: `SweepPlan = { ownAmount, swept, leftover }` from Task 1. The call site `planOverpaymentSweep(...)` itself is unchanged (same 4 arguments); only how the *result* is used changes.

- [ ] **Step 1: Replace the `targetAmount`-based entry insert and sweep loop**

In `src/routes/rent-payments.ts`, replace:

```ts
  const plan = planOverpaymentSweep(d.amount, target.expected_rent, target.amount_paid, otherOutstanding);

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

with:

```ts
  const plan = planOverpaymentSweep(d.amount, target.expected_rent, target.amount_paid, otherOutstanding);
  const finalTargetAmount = Math.round((plan.ownAmount + plan.leftover) * 100) / 100;
  const allSwept = [...plan.swept];

  const now = new Date().toISOString();
  const entry = await c.env.DB.prepare(
    `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
     VALUES (?,?,?,?,?,?,?,?,NULL) RETURNING *`
  ).bind(
    rentPaymentId, finalTargetAmount, d.paid_date, d.payment_method,
    d.receipt_no ?? null, d.notes ?? null, String(user.sub), now
  ).first<{ id: number }>();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_added', 'payment', rentPaymentId,
    `Added ${finalTargetAmount} on ${d.paid_date}`);

  for (const swept of allSwept) {
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

This is a pure shape migration: `finalTargetAmount` is currently mathematically identical to the old `plan.targetAmount` (own share + leftover, exactly as before — Task 4 changes what happens to `leftover` when there's somewhere forward to send it, and Task 5 changes the note text). `allSwept` is currently just a copy of `plan.swept` (Task 4 appends to it).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error as the branch base commit (`requireRole.test.ts`); nothing new referencing `rent-payments.ts`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: All tests pass (48 total: 14 from Tasks 1-2, 34 pre-existing). This task doesn't change any pure-function behavior, only how the route consumes the (already-passing) `SweepPlan` shape.

- [ ] **Step 4: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: consume the new SweepPlan shape in POST /:id/entries"
```

---

### Task 4: Forward-generation loop

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Interfaces:**
- Consumes: `applyExcessToCandidate`, `addMonthToYyyyMm` from `src/lib/paymentSweep.ts` (Task 1).

- [ ] **Step 1: Update the import line**

```ts
// before
import { planOverpaymentSweep, type OutstandingRow } from '../lib/paymentSweep';

// after
import { planOverpaymentSweep, applyExcessToCandidate, addMonthToYyyyMm, type OutstandingRow } from '../lib/paymentSweep';
```

- [ ] **Step 2: Insert the forward-generation loop right after computing `plan`**

Replace:

```ts
  const plan = planOverpaymentSweep(d.amount, target.expected_rent, target.amount_paid, otherOutstanding);
  const finalTargetAmount = Math.round((plan.ownAmount + plan.leftover) * 100) / 100;
  const allSwept = [...plan.swept];
```

with:

```ts
  const plan = planOverpaymentSweep(d.amount, target.expected_rent, target.amount_paid, otherOutstanding);
  let finalTargetAmount = plan.ownAmount;
  const allSwept: Array<{ rentPaymentId: number; amount: number }> = [...plan.swept];

  if (plan.leftover > 0) {
    let leftover = plan.leftover;
    const { results: cashContracts } = await c.env.DB.prepare(`
      SELECT id, annual_rent, no_of_pdc, end_date
      FROM contracts
      WHERE tenant_id = ? AND payment_type = 'cash' AND date(end_date) >= date('now')
    `).bind(target.tenant_id).all<{ id: number; annual_rent: number; no_of_pdc: number; end_date: string }>();

    const nextMonthByContract = new Map<number, string>();
    for (const contract of cashContracts) {
      nextMonthByContract.set(contract.id, addMonthToYyyyMm(target.month));
    }

    while (leftover > 0) {
      // Find the contract whose next candidate month is chronologically soonest (tie-break by contract id).
      let chosenContract: typeof cashContracts[number] | null = null;
      let chosenMonth = '';
      for (const contract of cashContracts) {
        const candidateMonth = nextMonthByContract.get(contract.id)!;
        if (candidateMonth > contract.end_date.slice(0, 7)) continue; // past this contract's lease term
        if (chosenContract === null || candidateMonth < chosenMonth ||
            (candidateMonth === chosenMonth && contract.id < chosenContract.id)) {
          chosenContract = contract;
          chosenMonth = candidateMonth;
        }
      }
      if (!chosenContract) break; // every contract has reached its own end_date; leftover stays on target

      // Critical: check whether a row already exists for this (contract, month) before
      // generating one. The unchanged otherOutstanding query above has no month-direction
      // filter — it already picked up ANY pending/overdue/partial row for this tenant,
      // past or future. If a row already exists here, it was already correctly considered
      // by planOverpaymentSweep's backward loop; re-touching it here would double-apply
      // the leftover on top of whatever the backward loop already decided.
      const existing = await c.env.DB.prepare(
        'SELECT id FROM rent_payments WHERE contract_id = ? AND month = ?'
      ).bind(chosenContract.id, chosenMonth).first<{ id: number }>();

      if (existing) {
        nextMonthByContract.set(chosenContract.id, addMonthToYyyyMm(chosenMonth));
        continue;
      }

      const expectedRent = Math.round((chosenContract.annual_rent / Math.max(1, chosenContract.no_of_pdc)) * 100) / 100;
      const inserted = await c.env.DB.prepare(`
        INSERT INTO rent_payments (contract_id, month, amount, status)
        VALUES (?, ?, ?, 'pending') RETURNING id
      `).bind(chosenContract.id, chosenMonth, expectedRent).first<{ id: number }>();

      // A brand-new row has no entries yet, so its remaining due is simply its full
      // expected amount — no need for a second query to re-derive amount_paid.
      const { applied, remainingExcess } = applyExcessToCandidate(leftover, expectedRent, 0);
      if (applied > 0) allSwept.push({ rentPaymentId: inserted!.id, amount: applied });
      leftover = remainingExcess;
      nextMonthByContract.set(chosenContract.id, addMonthToYyyyMm(chosenMonth));
    }

    finalTargetAmount = Math.round((plan.ownAmount + leftover) * 100) / 100;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error; nothing new referencing `rent-payments.ts`.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: All 48 tests still pass (this task only changes route logic, no pure-function behavior).

- [ ] **Step 5: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: cascade leftover overpayment forward to upcoming cash-contract months"
```

---

### Task 5: Origin-aware note text

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Interfaces:**
- None new — this task only changes the `target` query's selected columns and the note-text string used when inserting swept entries (both backward, from Task 3/4's untouched loop body, and forward, from Task 4's new loop).

- [ ] **Step 1: Add a local month-formatting helper**

Add, near the top of `src/routes/rent-payments.ts` (after the imports, before `const rentPayments = new Hono(...)`):

```ts
function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(year, m - 1);
  return date.toLocaleDateString('en-AE', { month: 'short', year: 'numeric' });
}
```

- [ ] **Step 2: Extend the `target` query to fetch the origin's unit/tenant name**

Replace:

```ts
  const target = await c.env.DB.prepare(`
    SELECT rp.month, c.tenant_id, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; tenant_id: number; expected_rent: number; amount_paid: number }>();
  if (!target) return c.json({ error: 'Payment not found' }, 404);
```

with:

```ts
  const target = await c.env.DB.prepare(`
    SELECT rp.month, c.tenant_id, t.name as tenant_name, u.unit_no, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; tenant_id: number; tenant_name: string; unit_no: string | null; expected_rent: number; amount_paid: number }>();
  if (!target) return c.json({ error: 'Payment not found' }, 404);
```

- [ ] **Step 3: Compute the origin label and use it in the swept-entry note**

Replace:

```ts
  for (const swept of allSwept) {
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
```

with:

```ts
  const originLabel = `${formatMonthLabel(target.month)} (${target.unit_no ? `Unit ${target.unit_no}` : target.tenant_name})`;

  for (const swept of allSwept) {
    await c.env.DB.prepare(
      `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
       VALUES (?,?,?,?,NULL,?,?,?,?)`
    ).bind(
      swept.rentPaymentId, swept.amount, d.paid_date, d.payment_method,
      `Auto-applied from overpayment on ${originLabel}`, String(user.sub), now, entry!.id
    ).run();
    await recomputePaymentStatus(c.env.DB, swept.rentPaymentId);
    await auditLog(c.env.DB, user, 'payment.auto_applied', 'payment', swept.rentPaymentId,
      `Applied ${swept.amount} from overpayment on rent_payment #${rentPaymentId}`);
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error; nothing new referencing `rent-payments.ts`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All 48 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: name the origin month and unit in auto-applied payment notes"
```

---

### Task 6: Full verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All 48 tests pass (14 new/updated from Tasks 1-2, 34 pre-existing).

- [ ] **Step 2: Run the type-checker across the whole project**

Run: `npx tsc --noEmit -p client/tsconfig.json && npx tsc --noEmit -p tsconfig.json`
Expected: Same baseline error counts as the branch base commit (25 client-side, 1 root-side) — nothing new anywhere.

- [ ] **Step 3: Manual verification checklist**

With access to a real or staging D1 (this project has no local D1 schema matching current production reality — see the cash-payment-count-schedule plan's Task 9 note; this verification should happen against the live/staging environment with explicit care, or against a hand-seeded local D1 with the real `contracts`/`rent_payments`/`payment_entries`/`units`/`tenants` schema):

1. Find or create a cash-contract tenant with **no** past overdue debt.
2. Overpay their current month by more than one month's rent (e.g. current month owes 400, pay 900).
3. Confirm: the current month shows `collected` with its own 400; a **new** `rent_payments` row appears for next month, already showing a swept entry of 500 with status `partial` or `collected` depending on that month's own expected rent.
4. Open the swept entry's note and confirm it reads `Auto-applied from overpayment on {origin month} (Unit {unit_no})`.
5. Overpay by enough to span two future months (e.g. pay 3x a normal month's rent with no past debt) — confirm both future months get created and swept in chronological order, oldest (soonest) first.
6. Delete the *original* overpayment entry — confirm both future months' swept entries are removed and both revert to plain `pending` (or `overdue` if their month has since passed), with amount_paid back to 0.
7. Repeat with a tenant who has *both* past overdue debt *and* would otherwise need forward sweep with a large overpayment — confirm the past debt is cleared first (oldest month first), and only the remaining leftover (if any) cascades forward.
8. Confirm a PDC contract with no dated future cheques does **not** get a speculative row created for it — a large overpayment on a PDC-only tenant with no past debt and no already-dated future cheques should simply leave the leftover on the target row exactly as before this feature.

- [ ] **Step 4: Commit (only if either command required fixes)**

If Steps 1-2 were already clean and Step 3 revealed no issues, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address issues found during overpayment forward-sweep verification"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (shared refactor) → Tasks 1-2. Section 2 (forward loop) → Task 4. Section 3 (traceability) → Task 5. Section 4 (deletion/cascade) — explicitly unchanged, no task needed (verified in Task 6's manual checklist, step 6). Testing section → Tasks 1, 2, 6.
- **Type consistency:** `SweepPlan = { ownAmount, swept, leftover }` (Task 1) is consumed identically at its one call site in `POST /:id/entries` (Task 3), and `applyExcessToCandidate`/`addMonthToYyyyMm` (Task 1) are imported and used with matching signatures in Task 4's forward loop.
- **Double-application bug caught during planning:** the original design sketch would have re-processed an already-existing future row (already considered by the unchanged backward-sweep query) inside the new forward loop, double-applying leftover to it. Fixed by adding an explicit existence check before generating any row — documented in both the design spec (updated) and this plan's Task 4.
- **No placeholders:** every step shows complete, exact before/after code verified against the real current file contents (both files were read in full during planning).
