# Payments: Balance Fix, Tenant Outstanding, and Payment Method

**Date:** 2026-05-19
**Status:** Approved

## Problem

Three gaps in the current rent payments UX:

1. The **Balance column** in the Payments tab shows the sum of all unpaid amounts across all months and all time — not useful for the current month view.
2. There is no way to see a tenant's **total outstanding debt** without navigating to the Payments tab and doing mental math.
3. When marking a payment collected, there is no way to record **how** it was paid (cash or cheque) — important because PDC tenants sometimes pay cash when a cheque has no funds.

## Goals

- Balance column = current month shortfall only
- Tenants tab shows each tenant's total outstanding at a glance
- Payment method (cash/cheque) is recorded on collection and visible in the table

---

## Change 1: Balance Column — Current Month Shortfall

### Backend (`src/routes/rent-payments.ts`)

Replace the `tenant_balance` correlated subquery in the SELECT with a simple inline expression:

```sql
MAX(0, expected_rent - CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as balance
```

Where `expected_rent` is already computed as:
```sql
CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END
```

**Result:**
- Collected, full amount → balance = 0
- Collected, partial → balance = shortfall (e.g. paid 1,000, expected 1,500 → balance = 500)
- Not collected → balance = full expected amount
- Annual lump sum, fully paid → balance = 0 ✓
- Annual lump sum, partial → balance = shortfall ✓

The `tenant_overdue` correlated subquery (sum of uncollected months *before* current month) is **unchanged**.

### Frontend (`client/src/lib/hooks/useRentals.ts`)

Rename `tenant_balance` → `balance` on the `RentPayment` type.

### Frontend (`client/src/components/rentals/tabs/PaymentsTab.tsx`)

Update the Balance column to use `p.balance` instead of `p.tenant_balance`. Display logic:
- `balance > 0` → show in red
- `balance === 0` → show `—` (dash, same as fully paid)

---

## Change 2: Total Outstanding Balance on Tenants Tab

### Backend (`src/routes/tenants.ts`)

Add a correlated subquery to the active tenants GET query:

```sql
(SELECT COALESCE(SUM(rp.amount), 0)
 FROM rent_payments rp
 JOIN contracts c2 ON rp.contract_id = c2.id
 WHERE c2.tenant_id = t.id
   AND rp.status != 'collected') as total_balance
```

This is the same logic that `tenant_balance` used in rent-payments — sum of all uncollected payment rows for the tenant across all time.

### Frontend (`client/src/lib/hooks/useRentals.ts`)

Add `total_balance?: number` to the `Tenant` type.

### Frontend (`client/src/components/rentals/tabs/TenantsTab.tsx`)

In the tenant list row, add a red sub-line under the tenant name when `total_balance > 0`:

```tsx
{t.total_balance > 0 && (
  <div className="text-xs text-red-600 font-medium">{formatAED(t.total_balance)} outstanding</div>
)}
```

Shown inside the existing `flex-1 min-w-0` div, below the name and unit/phone line.

---

## Change 3: Payment Method (Cash / Cheque)

### DB Migration (`migrations/0005-payment-method.sql`)

```sql
ALTER TABLE rent_payments ADD COLUMN payment_method TEXT
  CHECK(payment_method IN ('cash', 'cheque'));
```

Nullable — only set when a payment is marked collected. Existing collected rows have `NULL`, which displays as nothing (no chip shown).

### Backend (`src/routes/rent-payments.ts`)

Add `payment_method` to the PUT update Zod schema:

```typescript
payment_method: z.enum(['cash', 'cheque']).nullable().optional(),
```

The dynamic field builder already handles it automatically.

### Frontend (`client/src/lib/hooks/useRentals.ts`)

Add `payment_method?: 'cash' | 'cheque' | null` to the `RentPayment` type.

### Frontend (`client/src/components/rentals/tabs/PaymentsTab.tsx`) — CollectPopover

Add a Cash / Cheque toggle to the `CollectPopover` component. Default value based on the contract's `payment_type`:
- `payment_type = 'pdc'` → defaults to `'cheque'`
- `payment_type = 'cash'` → defaults to `'cash'`

The `RentPayment` type already includes `payment_type` from the API, so this is available in the popover.

UI: two pill buttons (Cash / Cheque), same style as status chips. Submitted alongside amount, date, receipt.

### Frontend (`client/src/components/rentals/tabs/PaymentsTab.tsx`) — Table Row

After collection, show a small grey chip next to the status badge:

```tsx
{p.payment_method && (
  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize ml-1">
    {p.payment_method}
  </span>
)}
```

Only visible when `payment_method` is set. Null (pre-feature rows) → nothing shown.

---

## Out of Scope

- Changing how `tenant_overdue` is calculated
- Payment method on historical/existing collected rows (they stay null)
- Filtering or reporting by payment method (future)
- Renewal flow (separate spec)
