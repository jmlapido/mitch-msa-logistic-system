# Cash Payment Count & Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cash-contract `payment_frequency` dropdown with a duration-derived "Number of Payments" count (mirroring PDC's "Number of Cheques"), make both date and amount genuinely editable per payment slot for cash with real effect on the Payments page, and migrate existing cash contracts onto the new model.

**Architecture:** `PaymentSchedulePanel.tsx` unifies its three rendering paths (PDC / cash-standard / cash-custom) into one — every contract, cash or PDC, renders the same virtual-slot-count-from-`no_of_pdc` list with editable date + amount, differing only in whether a file-upload column is shown (PDC only) and whether unset slots show computed defaults (cash only; PDC starts blank). Backend (`rent-payments.ts`, `reports.ts`, `tenants.ts`) generation and sync logic, currently keyed off `payment_frequency` (annual/quarterly/semi-annual/monthly), collapses to two cases: `payment_type = 'pdc'` (unchanged) and `payment_type = 'cash'` (new: divides `annual_rent` by the contract's own `no_of_pdc`, and now reads `pdc_cheques` overrides the same way PDC already does). A one-time data migration normalizes every existing cash contract's `no_of_pdc`/`payment_frequency` onto the new model.

**Tech Stack:** Hono + D1 (SQLite) backend, React + TypeScript + react-hook-form frontend, Vitest for unit tests, Cloudflare Workers/D1 deployment via `wrangler`.

## Global Constraints

- Default payment count: `round(months between start_date and end_date)`, minimum 1.
- Default per-slot amount: `annual_rent / no_of_pdc` (even split, total always equals `annual_rent` unless a slot is manually overridden).
- Default per-slot date (cash only, until overridden): same day-of-month as `start_date`, stepped by 1 month per slot; day-of-month clamped to the last valid day of the target month for months that don't have that day (e.g. Jan 31 start → Feb 28/29 default).
- `payment_frequency` internally: `'monthly'` for every cash contract, `'custom'` for every PDC contract (unchanged) — no longer user-chosen for cash.
- File upload/preview stays PDC-only. No schema changes needed beyond the data migration (columns and CHECK constraints already support this — see `migrate-payment-frequency.sql` for the canonical `contracts` table definition).
- No changes to `Reports.tsx`'s month-selector or `contracts.due_day` column removal — out of scope.
- Baseline note: `npx tsc --noEmit -p client/tsconfig.json` on this branch's base commit already reports 25 lines of pre-existing errors unrelated to this feature (`PartnersTab.tsx`, `TenantsTab.tsx` re: an unrelated prop-type issue, `useRentals.ts`, `Settings.tsx`); root `tsconfig.json` has 1 pre-existing error (`src/middleware/requireRole.test.ts`). Every type-check step in this plan means "no *new* errors beyond that baseline," not zero errors overall.
- This codebase has no D1-backed backend test infrastructure (the two existing backend test files test pure middleware/auth logic only). Verification for all SQL/migration changes in this plan is manual, not automated — see each task's Step for the manual check.

---

### Task 1: Duration → default payment count helper

**Files:**
- Modify: `client/src/lib/utils.ts`
- Create: `client/src/lib/utils.test.ts`

**Interfaces:**
- Produces: `monthsBetweenRounded(startDate: string, endDate: string): number` — exported from `client/src/lib/utils.ts`. Task 3 imports this.

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { monthsBetweenRounded } from './utils';

describe('monthsBetweenRounded', () => {
  it('returns 12 for an exact one-year span', () => {
    expect(monthsBetweenRounded('2026-01-01', '2027-01-01')).toBe(12);
  });

  it('returns 1 for a short span under a month', () => {
    expect(monthsBetweenRounded('2026-01-01', '2026-01-15')).toBe(1);
  });

  it('rounds down when closer to the lower whole month', () => {
    // ~11.5 months would round to 12; use a span clearly closer to 11
    expect(monthsBetweenRounded('2026-01-01', '2026-11-20')).toBe(11);
  });

  it('rounds up when closer to the higher whole month', () => {
    expect(monthsBetweenRounded('2026-01-01', '2027-01-10')).toBe(12);
  });

  it('never returns less than 1 even for a zero-length or inverted span', () => {
    expect(monthsBetweenRounded('2026-01-01', '2026-01-01')).toBe(1);
    expect(monthsBetweenRounded('2026-01-01', '2025-12-01')).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- utils.test`
Expected: FAIL — `monthsBetweenRounded` is not exported from `./utils` (module has no such export).

- [ ] **Step 3: Implement the helper**

Add to `client/src/lib/utils.ts` (after the existing `monthLabel` function):

```ts
export function monthsBetweenRounded(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = (end.getTime() - start.getTime()) / 86400000;
  const months = totalDays / 30.4375;
  return Math.max(1, Math.round(months));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- utils.test`
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/utils.ts client/src/lib/utils.test.ts
git commit -m "feat: add monthsBetweenRounded helper for cash payment count default"
```

---

### Task 2: Schedule panel unification

**Files:**
- Modify: `client/src/components/rentals/PaymentSchedulePanel.tsx`

**Interfaces:**
- Produces: `PaymentSchedulePanel({ contractId, paymentType, startDate, slotCount, annualRent }: Props)` — the `paymentFrequency` prop is **removed** from `Props`. Task 3 updates the one call site in `ContractsPanel.tsx` to match.

- [ ] **Step 1: Replace the slot-generation logic**

In `client/src/components/rentals/PaymentSchedulePanel.tsx`, delete the `INTERVAL_MONTHS` and `SLOT_COUNTS` constants (lines 21-33):

```ts
// delete these two constants entirely
const INTERVAL_MONTHS: Record<string, number> = { ... };
const SLOT_COUNTS: Record<string, number> = { ... };
```

Delete the `Props` type's `paymentFrequency` field and the component's `paymentFrequency` destructured param:

```ts
// before
type Props = {
  contractId: number;
  paymentFrequency: string;
  paymentType: string;
  startDate: string;
  slotCount: number;
  annualRent: number;
};

export function PaymentSchedulePanel({ contractId, paymentFrequency, paymentType, startDate, slotCount, annualRent }: Props) {

// after
type Props = {
  contractId: number;
  paymentType: string;
  startDate: string;
  slotCount: number;
  annualRent: number;
};

export function PaymentSchedulePanel({ contractId, paymentType, startDate, slotCount, annualRent }: Props) {
```

Delete `isCustom` and replace the three slot-array definitions (`pdcSlots`, `standardSlots`, `customSlots`) and the `displaySlots` selector with one unified array:

```ts
// before
const isCustom = paymentFrequency === 'custom';
const isPdc = paymentType === 'pdc';
const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

// PDC: virtual slots from no_of_pdc count, blank dates, merges with saved rows
const pdcSlots = isPdc
  ? Array.from({ length: slotCount }, (_, i) => { ... })
  : [];

// Cash standard: auto-dated virtual slots (unchanged behavior)
const standardSlots = (!isPdc && !isCustom) ? (() => { ... })() : [];

// Cash custom: actual DB rows
const customSlots = (!isPdc && isCustom)
  ? [...rows].sort((a, b) => a.pdc_number - b.pdc_number).map(r => ({ ...r, amount: null as number | null }))
  : [];

const displaySlots = isPdc ? pdcSlots : isCustom ? customSlots : standardSlots;

// after
const isPdc = paymentType === 'pdc';
const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

// Both cash and PDC: virtual slots from no_of_pdc count, merged with saved rows.
// Cash gets computed defaults (date + even-split amount) for unset slots; PDC starts blank.
const displaySlots = Array.from({ length: slotCount }, (_, i) => {
  const n = i + 1;
  const saved = rows.find(r => r.pdc_number === n);
  const autoDate = !isPdc && startDate ? addMonths(startDate, i) : null;
  const autoAmount = !isPdc ? Math.round((annualRent / Math.max(1, slotCount)) * 100) / 100 : null;
  return {
    pdc_number: n,
    id: saved?.id ?? 0,
    contract_id: contractId,
    cheque_date: saved?.cheque_date ?? autoDate,
    amount: (saved as PdcRow | undefined)?.amount ?? autoAmount,
    file_name: saved?.file_name ?? null,
    file_size: saved?.file_size ?? null,
    file_type: saved?.file_type ?? null,
    updated_at: saved?.updated_at ?? '',
  };
});
```

- [ ] **Step 2: Show the amount input and summary counts for both types**

Replace the `amountSetCount`/`totalAmount` gating and the amount-input JSX gating (both currently `isPdc`-only):

```ts
// before
const amountSetCount = isPdc ? displaySlots.filter(s => s.amount != null).length : 0;

// after
const amountSetCount = displaySlots.filter(s => s.amount != null).length;
```

```ts
// before
const totalAmount = isPdc
  ? displaySlots.reduce((sum, s) => sum + (s.amount ?? 0), 0)
  : 0;

// after
const totalAmount = displaySlots.reduce((sum, s) => sum + (s.amount ?? 0), 0);
```

```ts
// before
if (isPdc) {
  summaryParts.push(`${amountSetCount}/${totalCount} amounts`);
  summaryParts.push(`${uploadedCount}/${totalCount} uploaded`);
  if (amountSetCount > 0 && totalAmount < annualRent) {
    const shortfall = annualRent - totalAmount;
    summaryParts.push(`⚠ ${shortfall.toLocaleString('en-US', { maximumFractionDigits: 2 })} uncovered`);
  }
}

// after
summaryParts.push(`${amountSetCount}/${totalCount} amounts`);
if (isPdc) summaryParts.push(`${uploadedCount}/${totalCount} uploaded`);
if (amountSetCount > 0 && totalAmount < annualRent) {
  const shortfall = annualRent - totalAmount;
  summaryParts.push(`⚠ ${shortfall.toLocaleString('en-US', { maximumFractionDigits: 2 })} uncovered`);
}
```

In the per-slot row JSX, change the amount `<input>` from `isPdc &&`-gated to always rendered:

```tsx
// before
{isPdc && (
  <input
    key={`amt-${s.pdc_number}-${s.amount}`}
    ...
  />
)}

// after
<input
  key={`amt-${s.pdc_number}-${s.amount}`}
  type="number"
  min={0}
  step="0.01"
  placeholder="Amount"
  defaultValue={s.amount ?? ''}
  disabled={!isAdmin}
  onBlur={e => isAdmin && saveSlot(
    s.pdc_number,
    currentDateRef.current[s.pdc_number] ?? s.cheque_date ?? '',
    e.target.value ? Number(e.target.value) : null
  )}
  className="text-[11px] bg-transparent border-0 border-b border-muted outline-none w-24 h-auto py-0 px-1 rounded-none placeholder:text-muted-foreground/50"
/>
```

(File upload/preview JSX, still gated `{isPdc && (...)}`, is unchanged — leave as-is.)

- [ ] **Step 3: Delete the now-dead custom-slot add/remove functions and their JSX**

Delete `addCustomSlot` and `removeCustomSlot` (both were only reachable from the deleted `customSlots` path):

```ts
// delete these two functions entirely
async function addCustomSlot() { ... }
async function removeCustomSlot(id: number) { ... }
```

Delete their JSX (the remove button inside the slot row, and the "Add payment slot" button below the list):

```tsx
// delete this block from inside the slot row
{!isPdc && isCustom && isAdmin && (
  <button onClick={() => removeCustomSlot(s.id)} ...>
    <Trash2 size={11} />
  </button>
)}
```

```tsx
// delete this block (appears after the slots .map(...) closes)
{!isPdc && isCustom && isAdmin && (
  <button onClick={addCustomSlot} ...>
    <Plus size={11} /> {adding ? 'Adding…' : 'Add payment slot'}
  </button>
)}
```

Remove the now-unused `adding`/`setAdding` state and the `Plus` icon import if no longer referenced elsewhere in the file:

```ts
// before
const [adding, setAdding] = useState(false);

// after
// (line removed)
```

Check the top-of-file `lucide-react` import — `Plus` was only used by the deleted "Add payment slot" button; remove it from the import if so:

```ts
// before
import { ChevronDown, ChevronRight, Upload, Eye, Trash2, CalendarDays, Plus } from 'lucide-react';

// after
import { ChevronDown, ChevronRight, Upload, Eye, Trash2, CalendarDays } from 'lucide-react';
```

(`Trash2` stays — still used by the PDC file-remove button.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: Same 25 lines of pre-existing baseline errors as the branch base commit (see Global Constraints); nothing new referencing `PaymentSchedulePanel.tsx`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All existing tests still pass (no test in this repo directly exercises `PaymentSchedulePanel.tsx`, per this codebase's convention of not writing component-render tests — see Task 1's pure-helper test as the established pattern instead).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/rentals/PaymentSchedulePanel.tsx
git commit -m "feat: unify cash and PDC payment schedule panel rendering"
```

---

### Task 3: Contract form & list display

**Files:**
- Modify: `client/src/components/rentals/ContractsPanel.tsx`

**Interfaces:**
- Consumes: `monthsBetweenRounded(startDate: string, endDate: string): number` from `client/src/lib/utils.ts` (Task 1). `PaymentSchedulePanel` with the reduced `Props` (no `paymentFrequency`) from Task 2.

- [ ] **Step 1: Update imports**

```ts
// before
import { formatDate } from '@/lib/utils';

// after
import { formatDate, monthsBetweenRounded } from '@/lib/utils';
```

Add `useEffect` to the React import:

```ts
// before
import { useState } from 'react';

// after
import { useState, useEffect } from 'react';
```

- [ ] **Step 2: Delete the now-dead frequency constants**

```ts
// delete both entirely — no longer referenced anywhere in this file after this task
const FREQ_LABELS: Record<string, string> = { ... };
const FREQ_COUNTS: Record<string, number> = { ... };
```

- [ ] **Step 3: Simplify the form's zod schema**

```ts
// before
const schema = z.object({
  contract_no: z.string().min(1, 'Required'),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  annual_rent: z.string().min(1, 'Required'),
  payment_type: z.enum(['cash', 'pdc']),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']),
  no_of_pdc: z.string().optional(),
  notes: z.string().optional(),
});

// after
const schema = z.object({
  contract_no: z.string().min(1, 'Required'),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  annual_rent: z.string().min(1, 'Required'),
  payment_type: z.enum(['cash', 'pdc']),
  no_of_pdc: z.string().optional(),
  notes: z.string().optional(),
});
```

- [ ] **Step 4: Add the dirty-field-aware auto-default effect**

Add `dirtyFields` to the destructured `formState`:

```ts
// before
const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting, errors } } = useForm<F>({
  resolver: zodResolver(schema),
});

// after
const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting, errors, dirtyFields } } = useForm<F>({
  resolver: zodResolver(schema),
});
```

Add the effect right after `applyDuration` (which already exists in the file):

```ts
const watchedPaymentType = watch('payment_type');
const watchedStartDate = watch('start_date');
const watchedEndDate = watch('end_date');

useEffect(() => {
  if (!editing && watchedPaymentType === 'cash' && watchedStartDate && watchedEndDate && !dirtyFields.no_of_pdc) {
    setValue('no_of_pdc', String(monthsBetweenRounded(watchedStartDate, watchedEndDate)));
  }
}, [watchedPaymentType, watchedStartDate, watchedEndDate, editing]);
```

- [ ] **Step 5: Update `openAdd`/`openEdit` reset payloads**

```ts
// before
function openAdd() {
  reset({
    contract_no: '', start_date: '', end_date: '', annual_rent: '',
    payment_type: 'pdc', payment_frequency: 'monthly', no_of_pdc: '1', notes: '',
  });
  setDurationAmt('');
  setEditing(null);
  setOpen(true);
}

// after
function openAdd() {
  reset({
    contract_no: '', start_date: '', end_date: '', annual_rent: '',
    payment_type: 'pdc', no_of_pdc: '1', notes: '',
  });
  setDurationAmt('');
  setEditing(null);
  setOpen(true);
}
```

```ts
// before
function openEdit(c: Contract) {
  reset({
    contract_no: c.contract_no,
    start_date: c.start_date,
    end_date: c.end_date,
    annual_rent: String(c.annual_rent),
    payment_type: c.payment_type ?? 'pdc',
    payment_frequency: c.payment_frequency ?? 'monthly',
    no_of_pdc: String(c.no_of_pdc ?? 1),
    notes: c.notes ?? '',
  });
  setDurationAmt('');
  setEditing(c);
  setOpen(true);
}

// after
function openEdit(c: Contract) {
  reset({
    contract_no: c.contract_no,
    start_date: c.start_date,
    end_date: c.end_date,
    annual_rent: String(c.annual_rent),
    payment_type: c.payment_type ?? 'pdc',
    no_of_pdc: String(c.no_of_pdc ?? 1),
    notes: c.notes ?? '',
  });
  setDurationAmt('');
  setEditing(c);
  setOpen(true);
}
```

- [ ] **Step 6: Update `onSubmit`**

```ts
// before
async function onSubmit(v: F) {
  const isPdc = v.payment_type === 'pdc';
  if (isPdc && (!v.no_of_pdc || Number(v.no_of_pdc) < 1)) {
    toast.error('Number of cheques must be at least 1');
    return;
  }
  const payload = {
    tenant_id: tenantId,
    contract_no: v.contract_no,
    start_date: v.start_date,
    end_date: v.end_date,
    annual_rent: Number(v.annual_rent),
    payment_type: v.payment_type,
    payment_frequency: isPdc ? 'custom' : v.payment_frequency,
    no_of_pdc: isPdc ? Number(v.no_of_pdc ?? 1) : undefined,
    notes: v.notes || undefined,
  };
  ...
}

// after
async function onSubmit(v: F) {
  const isPdc = v.payment_type === 'pdc';
  if (!v.no_of_pdc || Number(v.no_of_pdc) < 1) {
    toast.error(isPdc ? 'Number of cheques must be at least 1' : 'Number of payments must be at least 1');
    return;
  }
  const payload = {
    tenant_id: tenantId,
    contract_no: v.contract_no,
    start_date: v.start_date,
    end_date: v.end_date,
    annual_rent: Number(v.annual_rent),
    payment_type: v.payment_type,
    payment_frequency: (isPdc ? 'custom' : 'monthly') as 'custom' | 'monthly',
    no_of_pdc: Number(v.no_of_pdc),
    notes: v.notes || undefined,
  };
  ...
}
```

- [ ] **Step 7: Update the contract list badge**

```ts
// before
{contracts.map(c => {
  const freq = c.payment_frequency ?? 'monthly';
  const freqLabel = FREQ_LABELS[freq] ?? freq;
  const slotCount = freq === 'custom' ? null : FREQ_COUNTS[freq];
  return (

// after
{contracts.map(c => {
  return (
```

```tsx
<!-- before -->
<p>
  {(c.payment_type ?? 'pdc') === 'pdc' ? (
    <>Cheques: <span className="font-medium text-foreground">{c.no_of_pdc}</span></>
  ) : (
    <>
      Frequency:{' '}
      <span className="font-medium text-foreground">
        {freqLabel}{slotCount !== null ? ` (${slotCount} payment${slotCount !== 1 ? 's' : ''})` : ''}
      </span>
    </>
  )}
</p>

<!-- after -->
<p>
  {(c.payment_type ?? 'pdc') === 'pdc' ? (
    <>Cheques: <span className="font-medium text-foreground">{c.no_of_pdc}</span></>
  ) : (
    <>Payments: <span className="font-medium text-foreground">{c.no_of_pdc}</span></>
  )}
</p>
```

- [ ] **Step 8: Update the `PaymentSchedulePanel` call site**

```tsx
// before
<PaymentSchedulePanel
  contractId={c.id}
  paymentFrequency={freq}
  paymentType={c.payment_type ?? 'pdc'}
  startDate={c.start_date}
  slotCount={c.no_of_pdc}
  annualRent={c.annual_rent}
/>

// after
<PaymentSchedulePanel
  contractId={c.id}
  paymentType={c.payment_type ?? 'pdc'}
  startDate={c.start_date}
  slotCount={c.no_of_pdc}
  annualRent={c.annual_rent}
/>
```

- [ ] **Step 9: Replace the Payment Frequency dropdown with Number of Payments**

```tsx
// before
{watch('payment_type') === 'pdc' ? (
  <div>
    <Label>Number of Cheques *</Label>
    <Input
      {...register('no_of_pdc')}
      type="number"
      min={1}
      max={60}
      className="mt-1"
      placeholder="e.g. 6"
    />
    <p className="text-[11px] text-muted-foreground mt-1">
      Cheque dates and amounts are set in the schedule panel after saving.
    </p>
  </div>
) : (
  <div>
    <Label>Payment Frequency *</Label>
    <Select
      value={watch('payment_frequency')}
      onValueChange={v => setValue('payment_frequency', v as F['payment_frequency'])}
    >
      <SelectTrigger className="mt-1"><SelectValue placeholder="Select frequency" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="monthly">Monthly (12 payments/year)</SelectItem>
        <SelectItem value="quarterly">Quarterly (4 payments/year)</SelectItem>
        <SelectItem value="semi-annual">Semi-annual (2 payments/year)</SelectItem>
        <SelectItem value="annual">Annual (1 lump sum/year)</SelectItem>
        <SelectItem value="custom">Custom (set dates manually)</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}

// after
<div>
  <Label>{watch('payment_type') === 'pdc' ? 'Number of Cheques *' : 'Number of Payments *'}</Label>
  <Input
    {...register('no_of_pdc')}
    type="number"
    min={1}
    max={60}
    className="mt-1"
    placeholder="e.g. 6"
  />
  <p className="text-[11px] text-muted-foreground mt-1">
    {watch('payment_type') === 'pdc'
      ? 'Cheque dates and amounts are set in the schedule panel after saving.'
      : 'Defaults from the lease duration — dates and amounts are set in the schedule panel after saving.'}
  </p>
</div>
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: Same 25 lines of pre-existing baseline errors as the branch base commit; nothing new referencing `ContractsPanel.tsx`.

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: All existing tests still pass.

- [ ] **Step 12: Manual verification**

Run: `npm run dev:client` (and `npm run dev:api` in a separate terminal if the API isn't already running), open a tenant's Contracts panel.
Expected: Adding a new cash contract shows "Number of Payments" (no frequency dropdown), auto-filled from Start/End Date once both are set; editing an existing cash contract's count doesn't get silently overwritten by the dirty-field guard; the contract list shows "Payments: N" for cash and "Cheques: N" for PDC.

- [ ] **Step 13: Commit**

```bash
git add client/src/components/rentals/ContractsPanel.tsx
git commit -m "feat: replace cash payment frequency dropdown with duration-derived payment count"
```

---

### Task 4: Backend contract create/update

**Files:**
- Modify: `src/routes/contracts.ts`

**Interfaces:**
- Consumes: client payload from Task 3's `onSubmit` — `{ ..., payment_type: 'cash' | 'pdc', payment_frequency: 'custom' | 'monthly', no_of_pdc: number, ... }`.

- [ ] **Step 1: Delete the now-unused frequency-to-count map**

```ts
// delete entirely — no longer referenced after this task
const FREQ_PDC_COUNT: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
  custom: 0,
};
```

- [ ] **Step 2: Simplify the zod schema**

```ts
// before
const contractSchema = z.object({
  tenant_id: z.number().int().positive(),
  contract_no: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annual_rent: z.number().min(0),
  payment_type: z.enum(['cash', 'pdc']).default('pdc'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']).default('monthly'),
  no_of_pdc: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

// after
const contractSchema = z.object({
  tenant_id: z.number().int().positive(),
  contract_no: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annual_rent: z.number().min(0),
  payment_type: z.enum(['cash', 'pdc']).default('pdc'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']).default('monthly').optional(),
  no_of_pdc: z.number().int().min(1),
  notes: z.string().optional(),
});
```

(`payment_frequency` stays accepted-but-ignored in the input schema for backward compatibility with the request shape; the server always computes its own value below. `no_of_pdc` becomes required for both types.)

- [ ] **Step 3: Update the POST handler**

```ts
// before
contracts.post('/', requireAdmin, zv('json', contractSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const isPdc = d.payment_type === 'pdc';
  const payment_frequency = isPdc ? 'custom' : d.payment_frequency;
  const no_of_pdc = isPdc
    ? (d.no_of_pdc ?? 0)
    : (FREQ_PDC_COUNT[d.payment_frequency] ?? 0);
  const result = await c.env.DB.prepare(
    `INSERT INTO contracts (tenant_id, contract_no, start_date, end_date, annual_rent, payment_type, no_of_pdc, payment_frequency, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.tenant_id, d.contract_no, d.start_date, d.end_date, d.annual_rent, d.payment_type, no_of_pdc, payment_frequency, d.notes ?? null, user.sub).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'contract.created', 'contract', result?.id ?? null, `Contract #${d.contract_no}`);
  return c.json(result, 201);
});

// after
contracts.post('/', requireAdmin, zv('json', contractSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const isPdc = d.payment_type === 'pdc';
  const payment_frequency = isPdc ? 'custom' : 'monthly';
  const result = await c.env.DB.prepare(
    `INSERT INTO contracts (tenant_id, contract_no, start_date, end_date, annual_rent, payment_type, no_of_pdc, payment_frequency, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.tenant_id, d.contract_no, d.start_date, d.end_date, d.annual_rent, d.payment_type, d.no_of_pdc, payment_frequency, d.notes ?? null, user.sub).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'contract.created', 'contract', result?.id ?? null, `Contract #${d.contract_no}`);
  return c.json(result, 201);
});
```

- [ ] **Step 4: Update the PUT handler**

```ts
// before
contracts.put('/:id', requireAdmin, zv('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const patch: Record<string, unknown> = { ...d };
  if (d.payment_type === 'pdc') {
    patch.payment_frequency = 'custom';
    if (d.no_of_pdc !== undefined) patch.no_of_pdc = d.no_of_pdc;
  } else if (d.payment_frequency && d.payment_frequency !== 'custom') {
    patch.no_of_pdc = FREQ_PDC_COUNT[d.payment_frequency] ?? 0;
  }

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  ...
});

// after
contracts.put('/:id', requireAdmin, zv('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const patch: Record<string, unknown> = { ...d };
  if (d.payment_type === 'pdc') {
    patch.payment_frequency = 'custom';
  } else if (d.payment_type === 'cash') {
    patch.payment_frequency = 'monthly';
  }

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  ...
});
```

(`no_of_pdc`, when present in the partial patch, passes through unchanged via the initial `{ ...d }` spread — no special-casing needed since it's no longer derived from frequency.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error (`requireRole.test.ts`) as the branch base commit; nothing new referencing `contracts.ts`.

- [ ] **Step 6: Manual verification**

With the dev API running (`npm run dev:api`), create a cash contract via the UI (Task 3's form) and confirm the created row (`GET /api/contracts?tenant_id=...`) shows `payment_frequency: 'monthly'` and `no_of_pdc` matching whatever was submitted. Edit the same contract's "Number of Payments" and confirm the update persists.

- [ ] **Step 7: Commit**

```bash
git add src/routes/contracts.ts
git commit -m "feat: make no_of_pdc the direct cash payment count input"
```

---

### Task 5: Row generation & default-amount correctness (`rent-payments.ts`)

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Interfaces:**
- Consumes: `contracts.no_of_pdc`, `contracts.payment_frequency` (always `'monthly'` for cash post-migration, set by Task 4 and the Task 8 migration).

- [ ] **Step 1: Simplify the month-walk generation gate**

```sql
-- before (lines 76-108)
FROM contracts c
CROSS JOIN month_gen mg
WHERE date(c.start_date) <= mg.m || '-28'
  AND date(c.end_date) >= mg.m || '-01'
  AND mg.m <= ?
  AND c.payment_frequency != 'custom'
  AND c.payment_type != 'pdc'
  AND (
    c.payment_frequency = 'monthly'
    OR c.payment_frequency IS NULL
    OR (
      c.payment_frequency = 'annual'
      AND (
        (CAST(strftime('%Y', mg.m) AS INTEGER) * 12 + CAST(strftime('%m', mg.m) AS INTEGER))
        - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER))
      ) % 12 = 0
    )
    OR (
      c.payment_frequency = 'quarterly'
      AND (
        (CAST(strftime('%Y', mg.m) AS INTEGER) * 12 + CAST(strftime('%m', mg.m) AS INTEGER))
        - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER))
      ) % 3 = 0
    )
    OR (
      c.payment_frequency = 'semi-annual'
      AND (
        (CAST(strftime('%Y', mg.m) AS INTEGER) * 12 + CAST(strftime('%m', mg.m) AS INTEGER))
        - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER))
      ) % 6 = 0
    )
  )

-- after
FROM contracts c
CROSS JOIN month_gen mg
WHERE date(c.start_date) <= mg.m || '-28'
  AND date(c.end_date) >= mg.m || '-01'
  AND mg.m <= ?
  AND c.payment_type = 'cash'
```

(Every cash contract is `'monthly'` post-migration, so "every month between start and end" is the only case; the `annual`/`quarterly`/`semi-annual` cadence-gating branches are dead and removed. `c.payment_type != 'pdc'` becomes `c.payment_type = 'cash'` directly — equivalent today, clearer going forward.)

- [ ] **Step 2: Fix the insert CASE's default amount**

```sql
-- before (lines 68-72)
CASE
  WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
  WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
  WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
  ELSE ROUND(c.annual_rent / 12.0, 2)
  -- 'custom' frequency excluded above; handled in the separate INSERT below
END,

-- after
ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2),
```

(Since this INSERT is now only ever reached for `payment_type = 'cash'` per Step 1's WHERE clause, the CASE collapses to a single expression.)

- [ ] **Step 3: Fix the display `expected_rent` CASE**

```sql
-- before (lines 130-138)
CASE
  WHEN c.payment_type = 'pdc' THEN
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
  WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
  WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
  WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
  ELSE ROUND(c.annual_rent / 12.0, 2)
END as expected_rent,

-- after
CASE
  WHEN c.payment_type = 'pdc' THEN
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
  ELSE
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2))
END as expected_rent,
```

- [ ] **Step 4: Fix the `tenant_overdue` subquery CASE**

```sql
-- before (lines 150-162)
(SELECT COALESCE(SUM(
   CASE WHEN rp2.status = 'partial'
     THEN (CASE
       WHEN c2.payment_frequency = 'annual'      THEN c2.annual_rent
       WHEN c2.payment_frequency = 'quarterly'   THEN ROUND(c2.annual_rent / 4.0, 2)
       WHEN c2.payment_frequency = 'semi-annual' THEN ROUND(c2.annual_rent / 2.0, 2)
       WHEN c2.payment_frequency = 'custom'      THEN
         ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
       ELSE ROUND(c2.annual_rent / 12.0, 2)
     END - rp2.amount_paid)
     ELSE rp2.amount
   END
 ), 0)
 FROM rent_payments rp2
 JOIN contracts c2 ON rp2.contract_id = c2.id
 WHERE c2.tenant_id = t.id
   AND rp2.status NOT IN ('collected')
   AND rp2.month < ?) as tenant_overdue,

-- after
(SELECT COALESCE(SUM(
   CASE WHEN rp2.status = 'partial'
     THEN (CASE
       WHEN c2.payment_frequency = 'custom' THEN
         ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
       ELSE ROUND(c2.annual_rent / MAX(1, c2.no_of_pdc), 2)
     END - rp2.amount_paid)
     ELSE rp2.amount
   END
 ), 0)
 FROM rent_payments rp2
 JOIN contracts c2 ON rp2.contract_id = c2.id
 WHERE c2.tenant_id = t.id
   AND rp2.status NOT IN ('collected')
   AND rp2.month < ?) as tenant_overdue,
```

(`payment_frequency = 'custom'` is only ever true for PDC post-migration, so this keeps PDC's dated-cheque-count divisor and gives every cash contract the `no_of_pdc` divisor via the `ELSE`.)

- [ ] **Step 5: Fix the `balance` CASE**

```sql
-- before (lines 168-175)
MAX(0, (CASE
  WHEN c.payment_type = 'pdc' THEN
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
  WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
  WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
  WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
  ELSE ROUND(c.annual_rent / 12.0, 2)
END) - rp.amount_paid) as balance,

-- after
MAX(0, (CASE
  WHEN c.payment_type = 'pdc' THEN
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
  ELSE
    COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2))
END) - rp.amount_paid) as balance,
```

- [ ] **Step 6: Fix `recomputePaymentStatus`'s expected_rent CASE**

```sql
-- before (lines 236-244, inside recomputePaymentStatus)
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
) as expected_rent,

-- after
COALESCE(
  CASE WHEN c.payment_type IN ('pdc', 'cash') THEN pc.amount ELSE NULL END,
  CASE
    WHEN c.payment_frequency = 'custom' THEN
      ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
    ELSE ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2)
  END
) as expected_rent,
```

(This function's `pc` join is widened in Task 6, Step 2 — this step alone won't yet pick up cash's `pc.amount`; both steps are needed together for this function to be correct, but are split across tasks by concern per the plan's structure. Complete both tasks before relying on this behavior.)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error as the branch base commit; nothing new referencing `rent-payments.ts`.

- [ ] **Step 8: Manual verification**

With the dev API running, create a cash contract with `no_of_pdc = 18` (an 18-month schedule) via the UI, then query `GET /api/rent-payments?month=<a month within the lease>` and confirm `expected_rent` for that contract equals `annual_rent / 18` rounded to 2 decimals (not `annual_rent / 12`).

- [ ] **Step 9: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "fix: derive cash expected-rent from no_of_pdc instead of hardcoded frequency divisors"
```

---

### Task 6: Sync correctness (`rent-payments.ts`)

**Files:**
- Modify: `src/routes/rent-payments.ts`

**Interfaces:**
- Depends on Task 5 (same file) being applied first — this task's `recomputePaymentStatus` join widening completes what Task 5, Step 6 started.

- [ ] **Step 1: Widen the amount-sync UPDATE gate**

```sql
-- before (lines 18-36)
UPDATE rent_payments
SET amount = (
  SELECT pc.amount FROM pdc_cheques pc
  WHERE pc.contract_id = rent_payments.contract_id
    AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
    AND pc.amount IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM contracts c WHERE c.id = rent_payments.contract_id AND c.payment_type = 'pdc'
)
AND EXISTS (
  SELECT 1 FROM pdc_cheques pc
  WHERE pc.contract_id = rent_payments.contract_id
    AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
    AND pc.amount IS NOT NULL
)

-- after
UPDATE rent_payments
SET amount = (
  SELECT pc.amount FROM pdc_cheques pc
  WHERE pc.contract_id = rent_payments.contract_id
    AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
    AND pc.amount IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM contracts c WHERE c.id = rent_payments.contract_id AND c.payment_type IN ('pdc', 'cash')
)
AND EXISTS (
  SELECT 1 FROM pdc_cheques pc
  WHERE pc.contract_id = rent_payments.contract_id
    AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
    AND pc.amount IS NOT NULL
)
```

- [ ] **Step 2: Widen the `pc` join in the main `GET /` query**

```sql
-- before (lines 183-189)
LEFT JOIN pdc_cheques pc ON pc.id = (
  SELECT id FROM pdc_cheques
  WHERE contract_id = c.id
    AND c.payment_type = 'pdc'
    AND strftime('%Y-%m', cheque_date) = rp.month
  LIMIT 1
)

-- after
LEFT JOIN pdc_cheques pc ON pc.id = (
  SELECT id FROM pdc_cheques
  WHERE contract_id = c.id
    AND strftime('%Y-%m', cheque_date) = rp.month
  LIMIT 1
)
```

- [ ] **Step 3: Widen the `pc` join in `recomputePaymentStatus`**

```sql
-- before (lines 249-255)
LEFT JOIN pdc_cheques pc ON pc.id = (
  SELECT id FROM pdc_cheques
  WHERE contract_id = c.id
    AND c.payment_type = 'pdc'
    AND strftime('%Y-%m', cheque_date) = rp.month
  LIMIT 1
)

-- after
LEFT JOIN pdc_cheques pc ON pc.id = (
  SELECT id FROM pdc_cheques
  WHERE contract_id = c.id
    AND strftime('%Y-%m', cheque_date) = rp.month
  LIMIT 1
)
```

- [ ] **Step 4: Fix the `due_date` CASE to use `pdc_cheques` for cash, with day-of-month clamping**

```sql
-- before (lines 143-149)
CASE
  WHEN c.payment_type = 'cash' THEN
    rp.month || '-' || printf('%02d', COALESCE(c.due_day, 1))
  WHEN c.payment_type = 'pdc' THEN
    pc.cheque_date
  ELSE NULL
END as due_date,

-- after
CASE
  WHEN c.payment_type = 'cash' THEN
    COALESCE(pc.cheque_date, rp.month || '-' || printf('%02d',
      MIN(
        CAST(strftime('%d', c.start_date) AS INTEGER),
        CAST(strftime('%d', date(rp.month || '-01', '+1 month', '-1 day')) AS INTEGER)
      )
    ))
  WHEN c.payment_type = 'pdc' THEN
    pc.cheque_date
  ELSE NULL
END as due_date,
```

(`MIN(day_from_start, last_day_of_target_month)` clamps the default to the last valid day when `start_date`'s day-of-month doesn't exist in the target month, e.g. a Jan-31 start defaulting to Feb 28/29 — matching the client's `addMonths` clamping behavior from Task 2.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Same 1 pre-existing baseline error as the branch base commit; nothing new referencing `rent-payments.ts`.

- [ ] **Step 6: Manual verification**

With the dev API running: (a) for a cash contract, use the schedule panel to set a specific slot's amount, then confirm `GET /api/rent-payments?month=<that month>` reflects the new amount for `amount_paid`-adjacent fields (`expected_rent`, `balance`) and that `tenant_overdue` on the tenant list recalculates correctly if that row is overdue/partial; (b) for the same contract, leave a future slot's date unset and confirm `due_date` shows the `start_date`-day default (clamped correctly if `start_date` is on the 29th-31st); (c) explicitly set that slot's date via the schedule panel and confirm `due_date` switches to the explicit value.

- [ ] **Step 7: Commit**

```bash
git add src/routes/rent-payments.ts
git commit -m "fix: sync cash payment schedule overrides into rent_payments amount and due_date"
```

---

### Task 7: `reports.ts`, `tenants.ts`, and dead-branch frontend cleanup

**Files:**
- Modify: `src/routes/reports.ts`
- Modify: `src/routes/tenants.ts`
- Modify: `client/src/components/rentals/tabs/TenantsTab.tsx`
- Modify: `client/src/components/reports/ExpiringLeasesReportView.tsx`

**Interfaces:**
- Consumes: `contracts.no_of_pdc`, `contracts.payment_frequency` (same as Task 5).

- [ ] **Step 1: Fix `reports.ts`'s shared `EXPECTED_RENT` constant**

```ts
// before (lines 9-16)
const EXPECTED_RENT = `CASE
  WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
  WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
  WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
  WHEN c.payment_frequency = 'custom'      THEN
    ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
  ELSE ROUND(c.annual_rent / 12.0, 2)
END`;

// after
const EXPECTED_RENT = `CASE
  WHEN c.payment_frequency = 'custom' THEN
    ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
  ELSE ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2)
END`;
```

- [ ] **Step 2: Fix `reports.ts`'s Expiring Leases `monthly_rent` computation**

```sql
-- before (line 175)
ROUND(c.annual_rent/12, 2) as monthly_rent,

-- after
ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2) as monthly_rent,
```

- [ ] **Step 3: Fix `tenants.ts`'s `monthly_rent` computation**

```sql
-- before (line 33)
ROUND(c.annual_rent / 12, 2) as monthly_rent,

-- after
ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2) as monthly_rent,
```

- [ ] **Step 4: Fix `tenants.ts`'s `total_balance` subquery CASE**

```sql
-- before (lines 35-47)
(SELECT COALESCE(SUM(
   CASE WHEN rp.status = 'partial'
     THEN (CASE
       WHEN c2.payment_frequency = 'annual'      THEN c2.annual_rent
       WHEN c2.payment_frequency = 'quarterly'   THEN ROUND(c2.annual_rent / 4.0, 2)
       WHEN c2.payment_frequency = 'semi-annual' THEN ROUND(c2.annual_rent / 2.0, 2)
       WHEN c2.payment_frequency = 'custom'      THEN
         ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
       ELSE ROUND(c2.annual_rent / 12.0, 2)
     END - rp.amount_paid)
     ELSE rp.amount
   END
 ), 0)
 FROM rent_payments rp
 JOIN contracts c2 ON rp.contract_id = c2.id
 WHERE c2.tenant_id = t.id
   AND rp.status NOT IN ('collected')) as total_balance

-- after
(SELECT COALESCE(SUM(
   CASE WHEN rp.status = 'partial'
     THEN (CASE
       WHEN c2.payment_frequency = 'custom' THEN
         ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
       ELSE ROUND(c2.annual_rent / MAX(1, c2.no_of_pdc), 2)
     END - rp.amount_paid)
     ELSE rp.amount
   END
 ), 0)
 FROM rent_payments rp
 JOIN contracts c2 ON rp.contract_id = c2.id
 WHERE c2.tenant_id = t.id
   AND rp.status NOT IN ('collected')) as total_balance
```

- [ ] **Step 5: Remove the dead `isAnnual` branch in `TenantsTab.tsx`**

```tsx
// before (lines 202-211)
{(t.annual_rent || t.monthly_rent) && (
  <div className="text-right hidden sm:block">
    {t.payment_frequency === 'annual'
      ? <div className="text-sm font-semibold"><AedAmount amount={t.annual_rent!} /><span className="text-xs font-normal text-muted-foreground">/yr</span></div>
      : <div className="text-sm font-semibold"><AedAmount amount={t.monthly_rent!} /><span className="text-xs font-normal text-muted-foreground">/mo</span></div>
    }
    {t.end_date && <div className="text-xs text-muted-foreground">until {formatDate(t.end_date)}</div>}
  </div>
)}

// after
{(t.annual_rent || t.monthly_rent) && (
  <div className="text-right hidden sm:block">
    <div className="text-sm font-semibold"><AedAmount amount={t.monthly_rent!} /><span className="text-xs font-normal text-muted-foreground">/mo</span></div>
    {t.end_date && <div className="text-xs text-muted-foreground">until {formatDate(t.end_date)}</div>}
  </div>
)}
```

- [ ] **Step 6: Remove the dead `isAnnual` branch in `ExpiringLeasesReportView.tsx`**

```tsx
// before (lines 60-74)
{rows.map((r, i) => {
  const u = urgency(r.days_left);
  const isAnnual = r.payment_frequency === 'annual';
  return (
    <tr key={i} className="hover:bg-muted/20">
      <td className="px-3 py-1.5 font-medium">{r.tenant_name}</td>
      <td className="px-3 py-1.5">{r.unit_no ?? '—'}</td>
      <td className="px-3 py-1.5">{r.building_name ?? '—'}</td>
      <td className="px-3 py-1.5 text-center">{formatDate(r.end_date)}</td>
      <td className="px-3 py-1.5 text-center"><span className={u.cls}>{u.label}</span></td>
      <td className="px-3 py-1.5 text-right text-xs">
        {isAnnual
          ? <>{<AedAmount amount={r.annual_rent} />}<span className="text-muted-foreground">/yr</span></>
          : <>{<AedAmount amount={r.monthly_rent} />}<span className="text-muted-foreground">/mo</span></>}
      </td>

// after
{rows.map((r, i) => {
  const u = urgency(r.days_left);
  return (
    <tr key={i} className="hover:bg-muted/20">
      <td className="px-3 py-1.5 font-medium">{r.tenant_name}</td>
      <td className="px-3 py-1.5">{r.unit_no ?? '—'}</td>
      <td className="px-3 py-1.5">{r.building_name ?? '—'}</td>
      <td className="px-3 py-1.5 text-center">{formatDate(r.end_date)}</td>
      <td className="px-3 py-1.5 text-center"><span className={u.cls}>{u.label}</span></td>
      <td className="px-3 py-1.5 text-right text-xs">
        <AedAmount amount={r.monthly_rent} /><span className="text-muted-foreground">/mo</span>
      </td>
```

(The rest of the row, closing tags, etc. is unchanged — only the `isAnnual` ternary and its declaration are removed.)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json && npx tsc --noEmit -p tsconfig.json`
Expected: Same baseline error counts as the branch base commit (25 client, 1 root); nothing new referencing any of the four files touched in this task.

- [ ] **Step 8: Manual verification**

With the dev API running, open the Tenants tab and the Expiring Leases report; confirm both display `monthly_rent`/mo (not annual/yr) for every contract, cash or PDC, and that the displayed monthly figure for a cash contract with `no_of_pdc = 18` shows `annual_rent / 18` rounded to 2 decimals, not `annual_rent / 12`.

- [ ] **Step 9: Commit**

```bash
git add src/routes/reports.ts src/routes/tenants.ts client/src/components/rentals/tabs/TenantsTab.tsx client/src/components/reports/ExpiringLeasesReportView.tsx
git commit -m "fix: derive monthly-rent display from no_of_pdc everywhere, remove dead annual-frequency branches"
```

---

### Task 8: Data migration

**Files:**
- Create: `migrations/0012-cash-payment-count-migration.sql`

**Interfaces:**
- None — this is a standalone data migration, applied manually per this project's existing convention (see `README.md`'s documented `wrangler d1 execute` commands).

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0012-cash-payment-count-migration.sql`:

```sql
-- migrations/0012-cash-payment-count-migration.sql
-- Normalizes existing cash contracts onto the new "Number of Payments" model:
-- no_of_pdc becomes the real payment count (previously only meaningful for PDC),
-- and payment_frequency becomes 'monthly' for every cash contract (previously
-- annual/quarterly/semi-annual/monthly/custom).

-- Contracts already on the existing "custom" option (freeform manually-added
-- slots, no predetermined count) get no_of_pdc set to their actual existing
-- pdc_cheques row count.
UPDATE contracts
SET no_of_pdc = (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = contracts.id)
WHERE payment_type = 'cash' AND payment_frequency = 'custom';

-- Every other cash contract gets the frequency-equivalent count.
UPDATE contracts
SET no_of_pdc = CASE payment_frequency
  WHEN 'annual'      THEN 1
  WHEN 'quarterly'   THEN 4
  WHEN 'semi-annual' THEN 2
  ELSE 12
END
WHERE payment_type = 'cash' AND payment_frequency != 'custom';

-- Every cash contract now stores 'monthly' internally, regardless of its
-- original frequency choice.
UPDATE contracts
SET payment_frequency = 'monthly'
WHERE payment_type = 'cash';
```

- [ ] **Step 2: Apply against local D1 and verify**

Run: `npx wrangler d1 execute mitch-app-db --local --file=migrations/0012-cash-payment-count-migration.sql`
Expected: Command completes without error.

Run: `npx wrangler d1 execute mitch-app-db --local --command="SELECT id, contract_no, payment_type, payment_frequency, no_of_pdc FROM contracts WHERE payment_type = 'cash'"`
Expected: Every returned row has `payment_frequency = 'monthly'`; `no_of_pdc` values look sensible for each contract's prior frequency (e.g. a contract that was `quarterly` now shows `no_of_pdc = 4`; one that was `custom` shows a count matching how many `pdc_cheques` rows it actually had).

- [ ] **Step 3: Commit**

```bash
git add migrations/0012-cash-payment-count-migration.sql
git commit -m "feat: add migration normalizing cash contracts onto no_of_pdc payment model"
```

**Note for the human operator:** this migration must also be run against the **remote** production D1 database after this branch merges and deploys — `npx wrangler d1 execute mitch-app-db --remote --file=migrations/0012-cash-payment-count-migration.sql`. This is a production data mutation; do not run the `--remote` form without explicit confirmation from the user, separate from merging/deploying the code itself.

---

### Task 9: Full verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including Task 1's new `monthsBetweenRounded` cases and every pre-existing test (no regressions).

- [ ] **Step 2: Run the type-checker across the whole project**

Run: `npx tsc --noEmit -p client/tsconfig.json && npx tsc --noEmit -p tsconfig.json`
Expected: Same baseline error counts as the branch base commit (25 client-side, 1 root-side) — nothing new anywhere.

- [ ] **Step 3: End-to-end manual walkthrough**

With both `npm run dev:client` and `npm run dev:api` running:
1. Create a new cash contract with a 15-month span (e.g. start `2026-01-01`, end `2027-04-01`) — confirm "Number of Payments" defaults to 15.
2. Open its schedule panel — confirm 15 rows, each with a default date (same day-of-month as start, stepped monthly) and a default amount (`annual_rent / 15`).
3. Edit one slot's amount to something else, and one slot's date — confirm both persist after a page refresh, and that the "uncovered" warning appears if the edited amount drops the total below `annual_rent`.
4. Open the Payments page for a month within this contract's span — confirm the row's expected rent and due date reflect the schedule panel's values (including any override made in step 3).
5. Check the Tenants tab and Expiring Leases report — confirm this contract shows a sensible `monthly_rent`/mo figure (`annual_rent / 15` rounded), not `annual_rent / 12`.

- [ ] **Step 4: Commit (only if either command required fixes)**

If Steps 1-2 were already clean and Step 3 revealed no issues, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address issues found during cash payment schedule verification"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec (`docs/superpowers/specs/2026-07-08-cash-payment-count-schedule-design.md`) maps to a task: Section 1 (form/defaults) → Tasks 1, 3; Section 2 (schedule panel) → Task 2; Section 3 (backend generation/sync/migration) → Tasks 4, 5, 6, 8; Section 4 (reports.ts/tenants.ts/dead branches) → Task 7. Final verification → Task 9.
- **Type consistency:** `PaymentSchedulePanel`'s `Props` (Task 2) drops `paymentFrequency` and is consumed with the matching reduced prop set at its one call site (Task 3, Step 8). `monthsBetweenRounded(startDate: string, endDate: string): number` (Task 1) is called with the same signature in Task 3, Step 4. The client payload's `payment_frequency: 'custom' | 'monthly'` (Task 3, Step 6) matches what the server now always computes itself (Task 4, Steps 3-4) regardless of what's sent.
- **Task ordering:** Task 2 (schedule panel) precedes Task 3 (contract form) because Task 3's call-site update depends on Task 2's simplified `Props`. Task 6 depends on Task 5 completing first (both touch `rent-payments.ts`; Task 5's `recomputePaymentStatus` fix is only complete once Task 6 widens that function's `pc` join).
- **No placeholders:** every step shows complete, exact before/after code verified against the real current file contents (all files were read in full during planning); no step says "similar to Task N" without repeating the actual diff.
