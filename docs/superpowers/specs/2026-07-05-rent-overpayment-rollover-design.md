# Rent Overpayment Rollover Design

**Date:** 2026-07-05
**Status:** Approved

## Problem

Rent payments are tracked per contract-month (`rent_payments` row), each with its own `payment_entries`. Today, if a tenant owes 100 in June (unpaid) and pays 500 in July against a 400 due, the entire 500 is credited to July only:

- July's row shows `amount_paid = 500` against `expected_rent = 400` — visibly overpaid.
- June's row is untouched — still `overdue`, `amount_paid = 0`.
- The extra 100 has nowhere to go; it doesn't reduce the tenant's outstanding balance anywhere.

There is no mechanism to apply an overpayment to older outstanding debt, even though the app already aggregates a tenant's total balance/overdue across all their contracts (`tenant_overdue`, `total_balance` — see `src/routes/rent-payments.ts`, `src/routes/tenants.ts`).

## Goals

- When a recorded payment exceeds what's due for the month it was recorded against, automatically sweep the excess to the tenant's oldest outstanding unpaid/partial/overdue month, across **all** of the tenant's contracts (not just the current one) — cascading through multiple months if the excess is large enough.
- The swept amount must show up as a real `payment_entries` row on the target month, so that month's `status` genuinely flips to `collected` (or `partial`) — not just an aggregate-query illusion.
- Auto-created entries must be clearly tagged and traceable back to the payment that produced them.
- Deleting the original overpayment entry must reverse (cascade-delete) any entries it swept elsewhere, keeping the whole movement undoable as one unit.
- No behavior change when a payment doesn't exceed what's due (the overwhelming majority of payments).

## Non-Goals

- A tenant-level "credit balance" that can pre-pay months with no debt yet (only past/current outstanding debt is targeted; leftover excess beyond all existing debt just stays on the original row, same as today's uncapped behavior).
- Editing existing entries (unaffected — add/delete is still the correction flow, per the partial-payments design).
- Any change to bill payments (`bill_entries`) — this is scoped to rent (`rent_payments`) only.
- Reversing a *manually* deleted swept entry back onto the original entry, or any other multi-directional reconciliation — deleting a swept child entry directly is just a normal delete.

---

## Data Model

### Modified — `payment_entries`

**New migration `migrations/0012-payment-entry-source.sql`:**
```sql
ALTER TABLE payment_entries ADD COLUMN source_entry_id INTEGER REFERENCES payment_entries(id);
```

- `NULL` for a normal, directly-recorded entry (including the "own share" portion of an overpayment — see below).
- Set to the id of the originating entry for any entry that was auto-created by the sweep.

No index is added; `payment_entries` is small per tenant and this column is only ever looked up by exact `source_entry_id` when deleting a specific entry.

---

## Backend

### Modified — `POST /rent-payments/:id/entries`

Current behavior (`src/routes/rent-payments.ts`): insert one `payment_entries` row for the full entered amount against `:id`, then call `recomputePaymentStatus(:id)`.

**New behavior**, replacing the direct insert:

1. Compute `expected_rent` and current `amount_paid` for the target row `:id` (same CASE expression `recomputePaymentStatus` already uses).
2. `remainingDueTarget = max(0, expected_rent - amount_paid)`
   `portionForTarget = min(enteredAmount, remainingDueTarget)`
   `excess = enteredAmount - portionForTarget`
3. If `excess > 0`: fetch every other `rent_payments` row belonging to this tenant — join `rent_payments → contracts → tenants` via the target row's `contract_id → tenant_id`, across **all** the tenant's contracts — where `status IN ('pending', 'overdue', 'partial')` and `id != :id`, ordered by `month ASC, id ASC` (the `id` tie-breaker makes the order deterministic when two different contracts both have an outstanding row in the same month). For each candidate, compute its `expected_rent` / `amount_paid` the same way, and its `remainingDue`.
4. Walk the ordered candidates, greedily assigning `applyAmount = min(excess, remainingDue)` to each, reducing `excess` by that amount, until `excess` reaches 0 or candidates are exhausted. Record each `{ rentPaymentId, applyAmount }` that had `applyAmount > 0`.
5. Whatever `excess` remains after exhausting all candidates (no more debt anywhere for this tenant) is added back into `portionForTarget`. This preserves today's behavior when there's nothing to sweep into.
6. Perform the writes, in order:
   - Insert the target's own entry: `amount = portionForTarget`, `source_entry_id = NULL`, all other fields (`paid_date`, `payment_method`, `receipt_no`, `notes`) exactly as submitted.
   - For each swept candidate: insert an entry with `amount = applyAmount`, `source_entry_id = <target entry's id>`, `paid_date`/`payment_method` copied from the submitted payment, `receipt_no = NULL`, `notes = "Auto-applied from overpayment recorded on {paid_date}"`.
   - Call `recomputePaymentStatus` for the target row and every swept row.
   - Write `audit_log`: `payment.entry_added` for the target entry (existing), plus one `payment.auto_applied` per swept entry (`details: "Applied {applyAmount} to {month} (rent_payment #{id})"`).
7. Return the target entry (same response shape as today — swept entries aren't included in the response; the UI will see them the normal way when that row's popover is opened).

If `excess` is 0 (the common case), behavior is byte-for-byte identical to today — steps 3–4 are skipped entirely.

### Modified — `DELETE /rent-payments/:id/entries/:entryId`

1. Before deleting, fetch any child entries: `SELECT id, rent_payment_id, amount FROM payment_entries WHERE source_entry_id = :entryId`.
2. Delete the target entry.
3. Delete each child entry found in step 1.
4. Call `recomputePaymentStatus` on the target entry's `rent_payment_id`, and on every distinct `rent_payment_id` among the deleted children.
5. Audit log: `payment.entry_deleted` for the target (existing), plus one `payment.auto_applied_reversed` per reversed child (`details: "Reversed {amount} auto-applied to rent_payment #{rent_payment_id}"`).

Deleting a swept child entry directly (not via its parent) is unchanged from today's delete behavior — no special-casing, since a child is a perfectly normal entry from the DB's point of view; only the *parent* delete needs to look for children.

### No changes required

- `GET /rent-payments` — `tenant_overdue`/`balance` already sum from `payment_entries` via `amount_paid`; once swept entries exist, the numbers self-correct with no query changes.
- `GET /tenants` — same reasoning; `total_balance` already aggregates across all contracts.
- `GET /rent-payments/:id/entries` — already returns all entries for a row, including `notes` and (new) `source_entry_id`; no schema change needed to the response, it's `SELECT *`.

---

## Frontend

No component changes required.

- `PaymentPopover` (`client/src/components/rentals/tabs/PaymentsTab.tsx`) already renders every entry's `notes`, so the "Auto-applied from overpayment recorded on …" tag appears automatically in the entry list for whichever row the user opens.
- The status chip already reacts to whatever `status` comes back from the row query, so June flips from `overdue` → `collected` (or `partial`) the next time its data is fetched — no new UI state needed.
- `PaymentEntry` type gains one optional field: `source_entry_id: number | null`. Not otherwise used by the UI, but included for type accuracy.

**Toast copy is unchanged** (`"Payment recorded"`) — enhancing it to mention the swept amount (e.g. "100.00 applied to June") is a nice-to-have left out of scope; the primary request is that June's status actually flips, which it will.

---

## Testing

New `vitest` cases in a new `src/routes/rent-payments.test.ts` (following the existing pattern in `requireRole.test.ts`), covering:

1. Exact-match payment (entered amount == due) → no sweep, single entry, unchanged from current behavior.
2. Overpayment with exactly one older outstanding month → older month fully clears (`status = 'collected'`), target entry capped at its own due.
3. Overpayment spanning two older unpaid months (e.g. May partially covered, June fully covered) → correct split, correct cascade order (oldest first).
4. Overpayment exceeding all existing debt combined → leftover lands back on the target row; no entries created for months beyond what's owed.
5. Cascade delete: deleting the original (parent) entry removes every swept child entry and reverts each affected row's status/`amount_paid` correctly.
6. Deleting a swept child entry directly leaves the parent (and its own row) untouched.

---

## Out of Scope

- Tenant-level credit balances / pre-paying future months with no debt yet.
- Toast/UI copy changes beyond what already exists.
- Bill payments (`bill_entries`) — unaffected by this change.
- Editing existing entries.
