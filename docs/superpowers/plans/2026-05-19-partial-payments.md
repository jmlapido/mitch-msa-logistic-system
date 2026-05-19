# Partial Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add partial payment support — tenants can make multiple top-up payments per month, shortfalls carry forward into future `tenant_overdue` totals, and a new `payment_entries` table stores each payment event.

**Architecture:** A new `payment_entries` table stores each payment event (amount, date, method, receipt). A denormalized `amount_paid` column on `rent_payments` holds the running total (sum of entries), kept in sync on every entry add/delete. Status auto-transitions: no entries → pending/overdue, partial entries → partial, full payment → collected. The balance and tenant_overdue SQL expressions are updated to use `amount_paid` instead of `amount`. The CollectPopover in PaymentsTab is replaced with a PaymentPopover that shows entry history and an add-entry form.

**Tech Stack:** Cloudflare D1 (SQLite), Hono, Zod, React, TanStack Query, Radix UI Popover, Tailwind CSS. No D1 test infrastructure — verify via `npx wrangler d1 execute mitch-app-db --remote` queries and manual UI testing after deploy.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `migrations/0006-partial-payments.sql` | Create | Recreates rent_payments with 'partial' status + amount_paid; creates payment_entries table |
| `src/routes/rent-payments.ts` | Modify | Add GET/POST/DELETE entry routes; update GET balance+overdue SQL; simplify PUT schema |
| `src/routes/tenants.ts` | Modify | Update total_balance subquery for partial shortfall |
| `client/src/lib/hooks/useRentals.ts` | Modify | Add PaymentEntry type; add amount_paid to RentPayment; add usePaymentEntries hook; add entry mutations |
| `client/src/components/rentals/tabs/PaymentsTab.tsx` | Modify | Replace CollectPopover with PaymentPopover; update status chip colors; update collected column |

---

## Task 1: DB Migration

**Files:**
- Create: `migrations/0006-partial-payments.sql`

**Context:** The `rent_payments.status` column has a CHECK constraint `CHECK(status IN ('collected','pending','overdue'))`. SQLite cannot ALTER a CHECK constraint, so we must recreate the table. D1 has foreign key enforcement OFF by default, so DROP TABLE is safe. The auto-index from UNIQUE(contract_id, month) recreates automatically.

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0006-partial-payments.sql

-- Recreate rent_payments with 'partial' status and amount_paid column
CREATE TABLE rent_payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('collected', 'pending', 'overdue', 'partial')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  UNIQUE(contract_id, month)
);

INSERT INTO rent_payments_new
  SELECT id, contract_id, month, amount,
    CASE WHEN status = 'collected' THEN amount ELSE 0 END,
    paid_date, status, receipt_no, notes, recorded_by, recorded_at, payment_method
  FROM rent_payments;

DROP TABLE rent_payments;
ALTER TABLE rent_payments_new RENAME TO rent_payments;

-- payment_entries table (one row per payment event)
CREATE TABLE payment_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rent_payment_id INTEGER NOT NULL REFERENCES rent_payments(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('cash', 'cheque')),
  receipt_no TEXT,
  notes TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payment_entries_rent_payment ON payment_entries(rent_payment_id);
```

- [ ] **Step 2: Apply to production D1**

```bash
npx wrangler d1 execute mitch-app-db --remote --file=migrations/0006-partial-payments.sql
```

Expected output:
```
✅  Successfully executed 1 command in 0.XXms
```

- [ ] **Step 3: Verify schema**

```bash
npx wrangler d1 execute mitch-app-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('rent_payments','payment_entries')"
```

Expected: both `rent_payments` and `payment_entries` appear.

```bash
npx wrangler d1 execute mitch-app-db --remote --command="SELECT sql FROM sqlite_master WHERE name='rent_payments'"
```

Expected: sql contains `amount_paid` and `'partial'` in the CHECK constraint.

- [ ] **Step 4: Verify backfill**

```bash
npx wrangler d1 execute mitch-app-db --remote --command="SELECT status, COUNT(*) as n, SUM(amount_paid) FROM rent_payments GROUP BY status"
```

Expected: `collected` rows have `amount_paid > 0`; `pending`/`overdue` rows have `amount_paid = 0`.

- [ ] **Step 5: Commit**

```bash
git add migrations/0006-partial-payments.sql
git commit -m "feat: add partial payments migration — payment_entries table and amount_paid column"
```

---

## Task 2: Backend — Payment Entry Routes

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Context:** Three new routes mount on the existing `rentPayments` Hono router. A shared helper `recomputePaymentStatus` recalculates `amount_paid` and `status` after any entry change. Routes go before the `export default rentPayments` line.

The current file ends at line 120 with `export default rentPayments;`. The PUT handler is at line 101.

- [ ] **Step 1: Add the recompute helper and entry Zod schema**

After the `updatePaymentSchema` block (after line 99), insert:

```typescript
const addEntrySchema = z.object({
  amount: z.number().positive(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

async function recomputePaymentStatus(db: D1Database, rentPaymentId: number): Promise<void> {
  const row = await db.prepare(`
    SELECT rp.month,
      CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as new_sum
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; expected_rent: number; new_sum: number }>();
  if (!row) return;
  const currentMonth = new Date().toISOString().slice(0, 7);
  let status: string;
  if (row.new_sum >= row.expected_rent) status = 'collected';
  else if (row.new_sum > 0) status = 'partial';
  else if (row.month < currentMonth) status = 'overdue';
  else status = 'pending';
  await db.prepare('UPDATE rent_payments SET amount_paid = ?, status = ? WHERE id = ?')
    .bind(row.new_sum, status, rentPaymentId).run();
}
```

- [ ] **Step 2: Add GET /rent-payments/:id/entries**

After the recompute helper, add:

```typescript
rentPayments.get('/:id/entries', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM payment_entries WHERE rent_payment_id = ? ORDER BY paid_date ASC, id ASC'
  ).bind(id).all();
  return c.json(results);
});
```

- [ ] **Step 3: Add POST /rent-payments/:id/entries**

```typescript
rentPayments.post('/:id/entries', zValidator('json', addEntrySchema), async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const d = c.req.valid('json');
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

- [ ] **Step 4: Add DELETE /rent-payments/:id/entries/:entryId**

```typescript
rentPayments.delete('/:id/entries/:entryId', async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const entryId = Number(c.req.param('entryId'));
  await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ? AND rent_payment_id = ?')
    .bind(entryId, rentPaymentId).run();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_deleted', 'payment', rentPaymentId,
    `Deleted entry ${entryId}`);
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: add payment entry routes (GET/POST/DELETE /rent-payments/:id/entries)"
```

---

## Task 3: Backend — Update GET /rent-payments SQL

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Context:** Two SQL expressions in the GET handler need updating. The `balance` expression currently uses `rp.amount` (which is only meaningful when collected) — replace with `rp.amount_paid`. The `tenant_overdue` subquery currently sums `rp2.amount` for all non-collected past rows — update to sum the shortfall for `partial` rows instead of the full amount.

Current file lines to change (approximate — read file to confirm exact lines):
- `balance` expression is around line 69
- `tenant_overdue` subquery is around lines 63–68

- [ ] **Step 1: Update the `balance` expression**

Find this line in the GET query's SELECT:
```typescript
      MAX(0, (CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END)
           - CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as balance
```

Replace with:
```typescript
      MAX(0, (CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END)
           - rp.amount_paid) as balance
```

- [ ] **Step 2: Update the `tenant_overdue` subquery**

Find this block:
```typescript
      (SELECT COALESCE(SUM(rp2.amount), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status != 'collected'
         AND rp2.month < ?) as tenant_overdue,
```

Replace with:
```typescript
      (SELECT COALESCE(SUM(
         CASE WHEN rp2.status = 'partial'
           THEN (CASE WHEN c2.payment_frequency = 'annual' THEN c2.annual_rent ELSE ROUND(c2.annual_rent / 12, 2) END - rp2.amount_paid)
           ELSE rp2.amount
         END
       ), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status NOT IN ('collected')
         AND rp2.month < ?) as tenant_overdue,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: update rent-payments GET — balance uses amount_paid, tenant_overdue handles partial shortfall"
```

---

## Task 4: Backend — Update GET /tenants total_balance

**Files:**
- Modify: `src/routes/tenants.ts`

**Context:** The `total_balance` correlated subquery on the active tenants GET (lines 34–38) currently sums `rp.amount` for all non-collected rows. Partial rows should contribute only their shortfall (expected_rent − amount_paid), not their full `amount`.

- [ ] **Step 1: Update the total_balance subquery**

Find this block in `tenants.get('/', ...)` (lines 34–38):
```typescript
      (SELECT COALESCE(SUM(rp.amount), 0)
       FROM rent_payments rp
       JOIN contracts c2 ON rp.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp.status != 'collected') as total_balance
```

Replace with:
```typescript
      (SELECT COALESCE(SUM(
         CASE WHEN rp.status = 'partial'
           THEN (CASE WHEN c2.payment_frequency = 'annual' THEN c2.annual_rent ELSE ROUND(c2.annual_rent / 12, 2) END - rp.amount_paid)
           ELSE rp.amount
         END
       ), 0)
       FROM rent_payments rp
       JOIN contracts c2 ON rp.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp.status NOT IN ('collected')) as total_balance
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/tenants.ts
git commit -m "feat: update tenants total_balance to account for partial payment shortfall"
```

---

## Task 5: Backend — Simplify PUT /rent-payments Schema

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Context:** Payment details (amount, paid_date, payment_method, receipt_no) now live on `payment_entries`, not on the parent row. The PUT endpoint should only accept `notes` (row-level annotation) and `status` (for manual overrides like reverting to pending). Add `'partial'` to the status enum.

- [ ] **Step 1: Replace updatePaymentSchema**

Find the current `updatePaymentSchema` (around line 92–99):
```typescript
const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  status: z.enum(['collected', 'pending', 'overdue']).optional(),
  paid_date: z.string().nullable().optional(),
  receipt_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  payment_method: z.enum(['cash', 'cheque']).nullable().optional(),
});
```

Replace with:
```typescript
const updatePaymentSchema = z.object({
  status: z.enum(['collected', 'pending', 'overdue', 'partial']).optional(),
  notes: z.string().nullable().optional(),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "feat: simplify PUT /rent-payments schema — remove payment fields, add partial status"
```

---

## Task 6: Frontend — Types and Hooks

**Files:**
- Modify: `client/src/lib/hooks/useRentals.ts`

**Context:** Three changes: (1) add `PaymentEntry` type, (2) add `amount_paid: number` to `RentPayment`, (3) add `usePaymentEntries` hook and two mutations (`addPaymentEntry`, `deletePaymentEntry`) to `useRentalMutations`.

- [ ] **Step 1: Add PaymentEntry type**

After line 9 (`export type RentalDoc = ...`), insert:

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

- [ ] **Step 2: Add amount_paid to RentPayment type**

Find the `RentPayment` type (line 8). Replace:
```typescript
export type RentPayment = { id: number; lease_id: number; month: string; amount: number; status: string; paid_date?: string; receipt_no?: string; notes?: string; due_date?: string; tenant_id: number; tenant_name: string; tenant_phone?: string; tenant_email?: string; unit_no: string; building_name: string; building_id: number; expected_rent: number; tenant_overdue: number; balance: number; payment_method?: 'cash' | 'cheque' | null; payment_type: string };
```

With:
```typescript
export type RentPayment = { id: number; lease_id: number; month: string; amount: number; amount_paid: number; status: string; paid_date?: string; receipt_no?: string; notes?: string; due_date?: string; tenant_id: number; tenant_name: string; tenant_phone?: string; tenant_email?: string; unit_no: string; building_name: string; building_id: number; expected_rent: number; tenant_overdue: number; balance: number; payment_method?: 'cash' | 'cheque' | null; payment_type: string };
```

- [ ] **Step 3: Add usePaymentEntries hook**

After the `useRentPayments` function (after line 56), add:

```typescript
export function usePaymentEntries(rentPaymentId: number, enabled = false) {
  return useQuery<PaymentEntry[]>({
    queryKey: ['payment-entries', rentPaymentId],
    queryFn: () => api.get(`/api/rent-payments/${rentPaymentId}/entries`),
    enabled,
  });
}
```

- [ ] **Step 4: Add addPaymentEntry and deletePaymentEntry mutations**

Inside `useRentalMutations`, after the `updateRentPayment` mutation (after line 112), add:

```typescript
    addPaymentEntry: useMutation({
      mutationFn: ({ rentPaymentId, ...d }: { rentPaymentId: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) =>
        api.post(`/api/rent-payments/${rentPaymentId}/entries`, d),
      onSuccess: (_: unknown, v: { rentPaymentId: number }) => {
        qc.invalidateQueries({ queryKey: ['rent-payments'] });
        qc.invalidateQueries({ queryKey: ['payment-entries', v.rentPaymentId] });
        qc.invalidateQueries({ queryKey: ['tenants'] });
      },
    }),
    deletePaymentEntry: useMutation({
      mutationFn: ({ rentPaymentId, entryId }: { rentPaymentId: number; entryId: number }) =>
        api.del(`/api/rent-payments/${rentPaymentId}/entries/${entryId}`),
      onSuccess: (_: unknown, v: { rentPaymentId: number; entryId: number }) => {
        qc.invalidateQueries({ queryKey: ['rent-payments'] });
        qc.invalidateQueries({ queryKey: ['payment-entries', v.rentPaymentId] });
        qc.invalidateQueries({ queryKey: ['tenants'] });
      },
    }),
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/hooks/useRentals.ts
git commit -m "feat: add PaymentEntry type, usePaymentEntries hook, and entry mutations"
```

---

## Task 7: Frontend — PaymentPopover Component

**Files:**
- Modify: `client/src/components/rentals/tabs/PaymentsTab.tsx`

**Context:** The existing `CollectPopover` function (lines 187–246) is replaced with `PaymentPopover`. The new component fetches entries when opened, shows the entry history with delete buttons, and has an add-entry form. The import of `useRentalMutations` is already present on line 9.

- [ ] **Step 1: Add useEffect to the React import and update the useRentals import**

Find line 1:
```typescript
import { useState } from 'react';
```

Replace with:
```typescript
import { useState, useEffect } from 'react';
```

Find line 9:
```typescript
import { useRentPayments, useBuildings, useRentalMutations, type RentPayment } from '@/lib/hooks/useRentals';
```

Replace with:
```typescript
import { useRentPayments, useBuildings, useRentalMutations, usePaymentEntries, type RentPayment, type PaymentEntry } from '@/lib/hooks/useRentals';
```

- [ ] **Step 2: Update the usage in PaymentsTab to use addPaymentEntry and deletePaymentEntry**

Find in `PaymentsTab` (around line 27):
```typescript
  const { updateRentPayment } = useRentalMutations();
```

Replace with:
```typescript
  const { addPaymentEntry, deletePaymentEntry } = useRentalMutations();
```

- [ ] **Step 3: Update the CollectPopover usage in the table row**

Find (around line 125):
```typescript
                              <CollectPopover payment={p} onUpdate={updateRentPayment.mutateAsync} />
                              {p.payment_method && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                                  {p.payment_method}
                                </span>
                              )}
```

Replace with:
```typescript
                              <PaymentPopover payment={p} onAdd={addPaymentEntry.mutateAsync} onDelete={deletePaymentEntry.mutateAsync} />
```

- [ ] **Step 4: Replace the CollectPopover function with PaymentPopover**

Delete the entire `CollectPopover` function (lines 187–246) and replace with:

```typescript
function PaymentPopover({
  payment,
  onAdd,
  onDelete,
}: {
  payment: RentPayment;
  onAdd: (d: { rentPaymentId: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) => Promise<unknown>;
  onDelete: (d: { rentPaymentId: number; entryId: number }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const { data: entries = [], isLoading: loadingEntries } = usePaymentEntries(payment.id, open);
  const defaultMethod: 'cash' | 'cheque' = payment.payment_type === 'cash' ? 'cash' : 'cheque';

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque'>(defaultMethod);
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const remaining = Math.max(0, payment.expected_rent - payment.amount_paid);
      setAmount(remaining > 0 ? String(remaining) : '');
      setDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod(defaultMethod);
      setReceipt('');
      setNotes('');
    }
  }, [open]);

  const STATUS_STYLE: Record<string, string> = {
    collected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    partial:   'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    overdue:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  async function handleAdd() {
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      await onAdd({
        rentPaymentId: payment.id,
        amount: Number(amount),
        paid_date: date,
        payment_method: paymentMethod,
        receipt_no: receipt || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded');
    } catch { toast.error('Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(entry: PaymentEntry) {
    try {
      await onDelete({ rentPaymentId: payment.id, entryId: entry.id });
      toast.success('Entry removed');
    } catch { toast.error('Failed'); }
  }

  const totalPaid = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[payment.status] ?? ''}`}>
          {payment.status}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2">
        <p className="text-xs font-semibold">Unit {payment.unit_no} — {monthLabel(payment.month)}</p>

        {loadingEntries && <p className="text-xs text-muted-foreground">Loading…</p>}

        {entries.length > 0 && (
          <div className="space-y-0.5">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                <div className="flex flex-col">
                  <span className="text-foreground">{formatDate(e.paid_date)} · <span className="capitalize">{e.payment_method ?? '—'}</span></span>
                  {e.receipt_no && <span className="text-muted-foreground">#{e.receipt_no}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{formatAED(e.amount)}</span>
                  <button onClick={() => handleDelete(e)} className="text-red-400 hover:text-red-600 ml-1 leading-none">✕</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold pt-1">
              <span>Total paid</span>
              <span className={totalPaid >= payment.expected_rent ? 'text-green-600' : 'text-orange-600'}>
                {formatAED(totalPaid)} / {formatAED(payment.expected_rent)}
              </span>
            </div>
          </div>
        )}

        <div className="border-t pt-2 space-y-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Add Payment</p>
          <div><Label className="text-xs">Amount</Label><Input value={amount} onChange={e => setAmount(e.target.value)} type="number" className="mt-0.5 h-7 text-xs" /></div>
          <div><Label className="text-xs">Date</Label><Input value={date} onChange={e => setDate(e.target.value)} type="date" className="mt-0.5 h-7 text-xs" /></div>
          <div>
            <Label className="text-xs">Method</Label>
            <div className="flex gap-1 mt-0.5">
              {(['cash', 'cheque'] as const).map(m => (
                <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                  className={`flex-1 text-xs py-1 rounded border capitalize transition-colors ${
                    paymentMethod === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs">Receipt No.</Label><Input value={receipt} onChange={e => setReceipt(e.target.value)} className="mt-0.5 h-7 text-xs" /></div>
          <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-0.5 h-7 text-xs" placeholder="Optional" /></div>
          <Button size="sm" className="w-full" onClick={handleAdd} disabled={submitting}>
            <Check size={12} className="mr-1" /> Record Payment
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/rentals/tabs/PaymentsTab.tsx
git commit -m "feat: replace CollectPopover with PaymentPopover supporting partial payments and entry history"
```

---

## Task 8: Frontend — PaymentsTab Table Display

**Files:**
- Modify: `client/src/components/rentals/tabs/PaymentsTab.tsx`

**Context:** Three small display updates: (1) `shouldHighlight` includes `partial` rows, (2) Collected column shows `amount_paid` for both `collected` and `partial` rows, with a shortfall indicator for `partial`.

- [ ] **Step 1: Update shouldHighlight**

Find (around line 97):
```typescript
                        const shouldHighlight = p.status === 'overdue' || (p.balance ?? 0) > 0;
```

Replace with:
```typescript
                        const shouldHighlight = p.status === 'overdue' || p.status === 'partial' || (p.balance ?? 0) > 0;
```

- [ ] **Step 2: Update the Collected column**

Find (around line 110):
```typescript
                            <td className="hidden sm:table-cell px-3 py-2 text-right">{p.status === 'collected' ? formatAED(p.amount) : '—'}</td>
```

Replace with:
```typescript
                            <td className="hidden sm:table-cell px-3 py-2 text-right">
                              {p.status === 'collected' && <span className="text-green-600">{formatAED(p.amount_paid)}</span>}
                              {p.status === 'partial' && (
                                <span className="text-orange-600 text-xs">{formatAED(p.amount_paid)} <span className="text-muted-foreground">/ {formatAED(p.expected_rent)}</span></span>
                              )}
                              {p.status !== 'collected' && p.status !== 'partial' && <span className="text-muted-foreground">—</span>}
                            </td>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/rentals/tabs/PaymentsTab.tsx
git commit -m "feat: update PaymentsTab — partial row highlighting and amount_paid display"
```

---

## Task 9: Deploy and Verify

- [ ] **Step 1: Deploy**

```bash
npm run deploy
```

Expected: build succeeds, worker deploys.

- [ ] **Step 2: Verify entry creation**

Open the Payments tab for May 2026. Click a pending payment status chip. The popover should show the "Add Payment" form with no entries listed. Enter a partial amount (e.g., 1,000 when 1,500 is due). Record it. The chip should change to **orange "partial"**, the Collected column should show "1,000 / 1,500".

- [ ] **Step 3: Verify top-up**

Click the same chip again. The entry list should show the first payment (1,000). Add another 300. The entry list should now show two rows totalling 1,300, chip still orange.

- [ ] **Step 4: Verify full collection**

Add a third payment for 200 (bringing total to 1,500). The chip should turn **green "collected"**, Collected column shows "1,500".

- [ ] **Step 5: Verify overdue carries forward**

For a payment left in `partial` state, navigate to the next month. The `Overdue` column for that tenant should show the shortfall (not the full amount).

- [ ] **Step 6: Verify entry delete**

Open a partial payment popover. Click ✕ on one entry. The entry disappears, totals recalculate, status reverts appropriately.

- [ ] **Step 7: Verify via wrangler query**

```bash
npx wrangler d1 execute mitch-app-db --remote --command="SELECT pe.id, pe.amount, pe.paid_date, rp.status, rp.amount_paid FROM payment_entries pe JOIN rent_payments rp ON pe.rent_payment_id = rp.id ORDER BY pe.id DESC LIMIT 10"
```

Expected: entries appear, `rp.amount_paid` matches the sum of entries, `rp.status` reflects the correct state.
