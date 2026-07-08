# Overpayment Forward Sweep Design

**Date:** 2026-07-08
**Status:** Approved

## Problem

The existing overpayment rollover feature (see `docs/superpowers/specs/2026-07-05-rent-overpayment-rollover-design.md`) sweeps an overpayment's excess to the tenant's oldest outstanding (pending/overdue/partial) month, across all their contracts. This works correctly for past debt. But live testing found that when a tenant has **no** past debt, overpaying does *not* carry the excess forward to next month — it just sits on the original row as an overpayment, uncapped.

Root cause, confirmed by reading `src/routes/rent-payments.ts`: `rent_payments` rows for cash contracts are only generated up through whichever month has actually been viewed (the month-walk INSERT at `rent-payments.ts:59-76` bounds at `mg.m <= :month`, where `:month` is whatever month the GET request asked for). PDC/custom rows are only generated from an *already-dated* `pdc_cheques` entry (`rent-payments.ts:78-91`). Neither proactively creates rows for months beyond "now." So when an admin overpays a tenant's current month and there's no past debt, next month's row typically doesn't exist yet — there's nothing in the database for the sweep to apply the leftover to. This is unrelated to the sweep's own math: `otherOutstanding`'s query (`rent-payments.ts:281-296`) has no month-direction filter and already orders results `month ASC`, so a future month's row, if it already existed with `status = 'pending'`, would already be swept into today.

## Goals

- After all past overdue debt is cleared (existing behavior, unchanged), any remaining leftover cascades forward to pre-pay the tenant's upcoming months — across all of the tenant's contracts, not just the one being overpaid — continuing month after month until the leftover is exhausted or every contract reaches its own `end_date`.
- For a cash contract with no existing `rent_payments` row yet for a needed future month, generate one on the spot, using the same expected-rent formula already used for real, generated rows (`ROUND(annual_rent / MAX(1, no_of_pdc), 2)`).
- PDC contracts stay excluded from this speculative generation — we cannot invent an amount for a cheque that hasn't been dated yet. If a future PDC row already exists (because a cheque was already dated), it continues to be swept into exactly as today, via the unchanged `otherOutstanding` query.
- Every swept entry (both backward, to past debt, and forward, to future months) gets a note that names the origin month and unit, not just the payment date — so opening any swept-into month immediately shows where the money came from.
- No behavior change when a payment doesn't exceed what's due (the common case).

## Non-Goals

- No arbitrary cap on how many future months can be pre-paid beyond each contract's own `end_date` — the lease term itself is the natural bound.
- No change to how PDC/custom-frequency contracts generate their `rent_payments` rows.
- No transactional/atomicity change beyond what's already documented as an accepted limitation in `rent-payments.ts` (see the existing `NOTE:` comment above `POST /:id/entries`) — this feature extends the same non-transactional read-then-write pattern to the forward-generation step.
- No UI changes — the schedule panel and Payments page already display whatever rows/entries exist; a newly-generated future row renders identically to any other pending month.

---

## 1. Shared pure-function refactor (`src/lib/paymentSweep.ts`)

Extract the per-candidate "how much can be applied here" calculation out of `planOverpaymentSweep`'s backward loop into its own small function, so the same logic can be reused by the new forward loop without duplication:

```ts
export function applyExcessToCandidate(
  excess: number,
  expectedRent: number,
  amountPaid: number,
): { applied: number; remainingExcess: number } {
  const remainingDue = Math.max(0, round2(expectedRent - amountPaid));
  const applied = Math.min(excess, remainingDue);
  return { applied, remainingExcess: round2(excess - applied) };
}
```

`planOverpaymentSweep`'s existing backward loop is refactored to call this helper instead of its current inline calculation — behavior is unchanged, just restructured for reuse.

`planOverpaymentSweep`'s return shape changes from `{ targetAmount, swept }` to `{ ownAmount, swept, leftover }`:
- `ownAmount`: the target row's own portion (`min(enteredAmount, remainingDueTarget)`), unchanged from today's `targetAmount` calculation for this piece.
- `swept`: unchanged — the list of `{ rentPaymentId, amount }` applied to backward candidates.
- `leftover`: the excess remaining after exhausting every backward candidate. Today this was silently added back into `targetAmount`; now it's returned explicitly so the caller can decide what to do with it (previously: always glue it back to the target; now: try forward-sweeping it first).

This is a breaking change to the function's return shape — `planOverpaymentSweep.test.ts`'s existing assertions are updated to check `ownAmount`/`leftover` instead of the combined `targetAmount`, but every existing scenario (exact match, one-month sweep, multi-month sweep, exceeds-all-debt, partial-target, skip-zero-due candidates, unrounded pass-through) stays and continues to pass with equivalent expected values, just split across the two fields (e.g. the "exceeds all existing debt" test's old `targetAmount: 900` becomes `ownAmount: 400, leftover: 500`).

## 2. Backend: forward pre-pay loop (`src/routes/rent-payments.ts`, `POST /:id/entries`)

After computing `plan` from the existing (unchanged) `otherOutstanding` static candidate query:

```ts
const plan = planOverpaymentSweep(d.amount, target.expected_rent, target.amount_paid, otherOutstanding);
let finalTargetAmount = plan.ownAmount;
const allSwept = [...plan.swept];

if (plan.leftover > 0) {
  let leftover = plan.leftover;
  const { results: cashContracts } = await c.env.DB.prepare(`
    SELECT id, annual_rent, no_of_pdc, end_date
    FROM contracts
    WHERE tenant_id = ? AND payment_type = 'cash' AND date(end_date) >= date('now')
  `).bind(target.tenant_id).all<{ id: number; annual_rent: number; no_of_pdc: number; end_date: string }>();

  // Track next month to consider per contract, starting the month after the target's own month.
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

    const expectedRent = Math.round((chosenContract.annual_rent / Math.max(1, chosenContract.no_of_pdc)) * 100) / 100;
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
      VALUES (?, ?, ?, 'pending')
    `).bind(chosenContract.id, chosenMonth, expectedRent).run();

    const row = await c.env.DB.prepare(`
      SELECT id, ${expectedRentSql} as expected_rent,
        COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rent_payments.id), 0) as amount_paid
      FROM rent_payments
      JOIN contracts c ON rent_payments.contract_id = c.id
      LEFT JOIN pdc_cheques pc ON pc.id = (
        SELECT id FROM pdc_cheques WHERE contract_id = c.id AND strftime('%Y-%m', cheque_date) = rent_payments.month LIMIT 1
      )
      WHERE rent_payments.contract_id = ? AND rent_payments.month = ?
    `).bind(chosenContract.id, chosenMonth).first<{ id: number; expected_rent: number; amount_paid: number }>();

    const { applied, remainingExcess } = applyExcessToCandidate(leftover, row!.expected_rent, row!.amount_paid);
    if (applied > 0) allSwept.push({ rentPaymentId: row!.id, amount: applied });
    leftover = remainingExcess;
    nextMonthByContract.set(chosenContract.id, addMonthToYyyyMm(chosenMonth));
  }

  finalTargetAmount = plan.ownAmount + leftover; // whatever's truly left over (rare) falls back to target, same as today
}
```

`addMonthToYyyyMm(month: string): string` is a small new helper (`'2026-07' → '2026-08'`), added alongside the existing pure helpers in `paymentSweep.ts` and unit-tested (including the December→January year-rollover case).

The rest of the handler (inserting the target's own entry using `finalTargetAmount`, inserting each `allSwept` entry, calling `recomputePaymentStatus` on every affected row, audit logging) is unchanged in structure from today — it just now iterates over `allSwept` instead of `plan.swept`, and uses `finalTargetAmount` instead of `plan.targetAmount`.

**Bounding:** the `while` loop is naturally bounded by contract `end_date`s — a lease has a finite number of months, so the loop cannot run away. No additional iteration cap is needed.

**Why cash contracts only:** the `cashContracts` query filters `payment_type = 'cash'`. A PDC/custom contract's future months are only real once a cheque has been dated — those rows, if they exist, are already picked up by the unchanged `otherOutstanding` query (which has no `payment_type` restriction); this loop just doesn't *speculatively create* new PDC rows, since there's no way to know a not-yet-dated cheque's amount.

## 3. Traceability: origin-aware note text

The `target` query (`rent-payments.ts:259-274`) gains a join to `units` to fetch the target row's own `unit_no`:

```sql
SELECT rp.month, c.tenant_id, u.unit_no, ${expectedRentSql} as expected_rent, ...
FROM rent_payments rp
JOIN contracts c ON rp.contract_id = c.id
JOIN tenants t ON c.tenant_id = t.id
LEFT JOIN units u ON t.unit_id = u.id
LEFT JOIN pdc_cheques pc ON ...
WHERE rp.id = ?
```

Every swept entry's `notes` (both backward and forward, `rent-payments.ts:317` today) changes from:

```
Auto-applied from overpayment recorded on {paid_date}
```

to:

```
Auto-applied from overpayment on {origin_month_label} (Unit {origin_unit_no})
```

where `origin_month_label` is `target.month` formatted the same way the UI already formats months elsewhere (e.g. `"Jul 2026"`, reusing the existing `monthLabel`-equivalent formatting convention — computed server-side here since the note is stored as plain text), and `origin_unit_no` is `target.unit_no` (falling back to a sensible placeholder like the unit's building/tenant name if `unit_no` is ever null, matching how other parts of this codebase already handle an optional unit).

## 4. Deletion / cascade

Unchanged. Deleting the parent entry already cascades to remove every entry with `source_entry_id = parent.id` (`rent-payments.ts:373-395`), regardless of whether that child lives on a past row or a newly-generated future one, and `recomputePaymentStatus` already correctly reverts the affected row's status. A newly-generated future `rent_payments` row that ends up with no entries after a cascade-delete simply reverts to a normal, empty `'pending'` row — indistinguishable from any other not-yet-due month.

---

## Testing

- `applyExcessToCandidate`: new unit tests covering full-application, partial-application (capped at remaining due), zero-remaining-due (skip), and the rounding behavior already exercised by `planOverpaymentSweep`'s existing suite.
- `planOverpaymentSweep`: existing test file updated to assert the new `{ ownAmount, swept, leftover }` shape; all seven existing scenarios kept, values redistributed across the two fields as appropriate.
- `addMonthToYyyyMm`: new unit tests including the year-rollover case (`'2025-12' → '2026-01'`).
- No automated route-level tests (this codebase has no D1-backed test harness, consistent with the original overpayment feature and every other backend feature to date). Manual verification: find or create a tenant with no past debt, overpay a cash contract's current month by more than one month's rent, confirm a new `rent_payments` row appears for next month with a swept entry and an origin-naming note; overpay by enough to span two future months and confirm both get created and swept correctly in order; delete the original entry and confirm both future rows' swept entries are removed and their statuses revert to plain `pending`.

## Out of Scope

- Any UI change — existing components already render whatever rows exist.
- PDC/custom speculative row generation.
- Transactional/atomicity guarantees beyond the already-accepted limitation.
- A cap on forward months beyond each contract's own lease term.
