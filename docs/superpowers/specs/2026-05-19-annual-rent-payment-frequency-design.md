# Annual Rent Payment Frequency

**Date:** 2026-05-19
**Status:** Approved

## Problem

Some tenants pay their rent as a single annual lump sum rather than monthly. The current system generates a `rent_payments` row for every month a contract is active, so annual payers show up as "pending" every month — creating noise and inaccurate reporting. PLATINUM TAXI is the first real example: they paid AED 259,200 in Aug 2025 for the full year, but the system shows 12 monthly pending rows.

## Goal

- Annual-frequency tenants appear in the Payments tab **only in their anniversary month** (once per year)
- The lump-sum amount is recorded as-is (full annual rent)
- Monthly-frequency tenants are unaffected
- Reports automatically reflect the correct amount in the correct month — no extra work needed

## Data Model

**Migration:** Add `payment_frequency` to `contracts`.

```sql
ALTER TABLE contracts ADD COLUMN payment_frequency TEXT NOT NULL DEFAULT 'monthly'
  CHECK(payment_frequency IN ('monthly', 'annual'));
```

Existing contracts default to `'monthly'` — no data migration needed.

## Backend Changes

### `src/routes/rent-payments.ts` — Payment generation CTE

The CTE inserts `rent_payments` rows on every GET request (`INSERT OR IGNORE`). Two changes:

1. **Row frequency:** For `annual` contracts, only insert for months that are exact anniversary months (i.e. `(year*12 + month) - (start_year*12 + start_month)` is divisible by 12).
2. **Amount:** For `annual` contracts, use `c.annual_rent` (full lump sum). For `monthly`, keep `ROUND(c.annual_rent / 12, 2)`.

The `expected_rent` field in the SELECT query also switches from `ROUND(c.annual_rent/12, 2)` to a CASE expression that returns `c.annual_rent` for annual contracts.

### `src/routes/contracts.ts` — CRUD schema

Add `payment_frequency` to the Zod create and update schemas:

```ts
payment_frequency: z.enum(['monthly', 'annual']).default('monthly')
```

Pass through to INSERT and UPDATE statements.

## Frontend Changes

### `client/src/lib/hooks/useRentals.ts`

Add `payment_frequency: 'monthly' | 'annual'` to the `Contract` type.

### Contract form (wherever contracts are created/edited)

Add a **Payment Frequency** field — a simple two-option select or toggle:
- Monthly (default)
- Annual (one-time lump sum per year)

### Payments tab — no logic change

Annual contracts simply have no row for non-anniversary months, so they never appear. In their anniversary month they show once with the full lump-sum amount. Stat cards (Expected, Collected, Pending, Overdue) sum from the actual rows, so they naturally reflect reality.

## Reports — no change

The rental and combined report queries aggregate `rp.amount` from existing rows. An annual payment in Aug 2025 shows up in the Aug 2025 report at AED 259,200. No other months are affected. This is exactly the desired behavior.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Existing `monthly` contracts | Unchanged — default covers them |
| Annual contract paid mid-year | Row for anniversary month only; prior months before first row was created stay as-is |
| Annual contract with PDC payment type | `payment_type` and `payment_frequency` are independent fields — both can be set |
| Switching from monthly to annual after rows exist | Old monthly rows remain; new CTE only inserts anniversary months going forward (`INSERT OR IGNORE` won't touch existing rows) |

## Out of Scope

- Pro-rating partial annual periods
- Splitting an annual payment across months in the UI
- Overdue logic changes for annual contracts (an unpaid anniversary month will naturally go overdue via the existing `UPDATE ... SET status = 'overdue'` query)
