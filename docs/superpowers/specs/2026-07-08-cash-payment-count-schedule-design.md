# Cash Payment Count & Schedule Design

**Date:** 2026-07-08
**Status:** Approved

## Problem

Cash rent contracts currently pick a `payment_frequency` (monthly/quarterly/semi-annual/annual), which fixes their expected-payment count to a hardcoded 12/4/2/1 regardless of the contract's actual lease duration. A due-date can be edited per slot in `PaymentSchedulePanel.tsx`, but that edit is cosmetic — the real `due_date` shown on the Payments page always comes from a separate fixed `contracts.due_day` column (`src/routes/rent-payments.ts:143-149`), never from the schedule panel's per-slot edits. Amount is not editable per slot at all for cash — it's a fixed `annual_rent / frequency-divisor` computed at query time.

PDC contracts already solve a related problem well: instead of picking a frequency, the admin sets a "Number of Cheques" count, and each cheque gets its own real, editable date + amount (`pdc_cheques` table), with a running "uncovered" warning if the total falls short of `annual_rent`.

## Goals

- Replace the `payment_frequency` dropdown with a "Number of Payments" count for cash contracts, mirroring PDC's "Number of Cheques" — one mental model for both payment types.
- Default that count from the contract's actual duration (`start_date` → `end_date`), not a fixed 12/4/2/1.
- Make both date and amount genuinely editable per payment slot for cash, and make those edits actually take effect on the Payments page (fixing the existing disconnect where date edits are saved but ignored).
- Keep the total of all slot amounts equal to `annual_rent`, redistributing evenly across however many slots exist, unless a slot's amount has been manually overridden.
- Migrate existing cash contracts onto the new model — no legacy code paths to maintain long-term.

## Non-Goals

- File upload/preview for cash payment slots — stays PDC-only (there's no physical cheque to scan for a cash payment).
- Dropping the `contracts.due_day` column — it becomes unused for cash going forward but stays in the schema; removing it is out of scope.
- Any change to how PDC contracts themselves behave — this only touches the cash path (`payment_type = 'cash'`).
- Any change to `rent_payments` row *generation timing* for cash — rows keep appearing automatically via month-walk regardless of whether the schedule panel has been touched (unlike PDC, where a row only appears once a slot has a date).

---

## 1. Contract form & default count

- `client/src/components/rentals/ContractsPanel.tsx`: the payment-frequency `<select>` (currently shown when `payment_type !== 'pdc'`, `:310-327`) is removed for cash. In its place, cash shows the same "Number of Payments" numeric input PDC already shows for `no_of_pdc` (`:295-309`), reusing the same column and same min/max bounds.
- Default value when the form is filled: `round(months between start_date and end_date)` — computed from whatever `end_date` is currently set (whether typed directly or produced by the existing duration helper, `calcEndDate`/`applyDuration`, `:48-56,82-86`), rounded to the nearest whole month. This is a one-time default; the admin can edit the count afterward exactly like PDC's count is already editable.
- Default per-slot date: same day-of-month as `start_date`, stepped by 1 month per slot — reusing the existing `addMonths` helper (`PaymentSchedulePanel.tsx:35-42`).
- Default per-slot amount: `annual_rent / count` — evenly split so the total always equals `annual_rent` regardless of count, matching PDC's existing formula (`rent-payments.ts:116,133,170`). If the admin later edits the count, unedited slots recompute their even split against the new count; any slot whose amount was manually overridden keeps its override.
- `payment_frequency` internally always stores `'monthly'` for cash going forward (no longer user-chosen) — needed because month-walk generation (Section 3) still keys off this column to decide whether a contract gets a row every month.

## 2. Schedule panel unification

`client/src/components/rentals/PaymentSchedulePanel.tsx` currently has three rendering paths: `pdcSlots` (date+amount+file, editable, `:93-109`), `standardSlots` (date-only, auto-computed, cash, `:112-132`), and `customSlots` (date-only, cash "custom", `:134-137`).

- `standardSlots` and `customSlots` are deleted. Cash now always renders through the `pdcSlots`-equivalent path: same virtual-slot-count-from-`no_of_pdc` generation, same per-slot editable date (`:255-265`) and editable amount (`:266-282`) fields.
- File upload/preview (`:266-316` inside the `isPdc` branch) stays gated to PDC only — cash slots get date + amount fields, no upload column.
- The `isPdc`/`isCustom` three-way branch (`:88-137`) collapses to a single slot-generation path plus one remaining conditional: whether to show the upload column.
- Panel label (`:146`, `isPdc ? 'Cheque Schedule' : 'Payment Schedule'`) is unchanged — cash already said "Payment Schedule."
- The dated/amount-set summary counts and "uncovered" warning (`:224-231`, currently gated `if (isPdc)`) now apply to cash too, since amount becomes editable and meaningful for cash.

## 3. Backend generation & sync (`src/routes/rent-payments.ts`)

- **One-time data migration** (new `migrations/0012-cash-payment-count-migration.sql`): for every contract with `payment_type = 'cash'`, recompute `no_of_pdc` from its current `payment_frequency` (`annual`→1, `quarterly`→4, `semi-annual`→2, `monthly`→12, unless already set to a different explicit value — see migration SQL below for the exact guard), then set `payment_frequency = 'monthly'` unconditionally for all cash contracts. After this migration, no cash contract has any `payment_frequency` value other than `'monthly'`.
- **Month-walk INSERT** (`:59-108`): the `annual`/`quarterly`/`semi-annual` cadence-gating `OR` clauses (`:86-107`) are deleted. Every cash contract is `'monthly'` post-migration, so every contract gets a row every month between `start_date` and `end_date`, same as today's plain monthly case.
- **Default amount formula** (insert CASE `:68-72` and display CASE `:134-137`): the hardcoded `ROUND(c.annual_rent / 12.0, 2)` becomes `ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2)` for cash — using the contract's own stored count directly (unlike PDC, which counts *dated* cheques dynamically; cash rows exist unconditionally regardless of scheduling, so the divisor is the fixed stored count). The `annual`/`quarterly`/`semi-annual` branches of these CASEs are deleted along with the migration.
- **Amount sync** (`:16-36`): the `WHERE ... c.payment_type = 'pdc'` gate widens to also match `c.payment_type = 'cash'` — once an admin edits a slot's amount in the schedule panel, that override flows into `rent_payments.amount` for cash exactly like it already does for PDC.
- **Due-date sync (new behavior)**: the `due_date` CASE (`:143-149`) changes for cash from always `c.due_day`-based to: use `pdc_cheques.cheque_date` for that month if that slot has been dated, otherwise fall back to the `start_date`-day-of-month default — mirroring how PDC already resolves `due_date` straight from `pc.cheque_date`. This requires joining `pdc_cheques` into the cash due-date computation, which today's query doesn't do at all for cash.
- `contracts.due_day`: no longer read for cash going forward; column stays in the schema, unused (see Non-Goals).

### Migration SQL sketch

```sql
-- migrations/0012-cash-payment-count-migration.sql
UPDATE contracts
SET no_of_pdc = CASE payment_frequency
  WHEN 'annual'      THEN 1
  WHEN 'quarterly'   THEN 4
  WHEN 'semi-annual' THEN 2
  ELSE 12
END
WHERE payment_type = 'cash';

UPDATE contracts
SET payment_frequency = 'monthly'
WHERE payment_type = 'cash';
```

---

## Testing

- Backend: new test cases (following the existing pattern in `src/routes/`) covering: month-walk still generates one row per month for a cash contract; default amount divides `annual_rent` by `no_of_pdc` (not a fixed 12); amount-sync now applies to cash; due-date sync uses `pdc_cheques.cheque_date` when set, falls back to `start_date`-day otherwise.
- Migration: a test or manual check confirming pre-migration contracts with `quarterly`/`semi-annual`/`annual` end up with the correct `no_of_pdc` and `payment_frequency = 'monthly'` after running the migration SQL.
- Frontend: no new automated tests planned for the schedule panel UI itself (matches this codebase's existing convention of testing pure logic, not rendered components — see the `MonthYearSelector` precedent). Manual verification: create a cash contract, confirm default count/dates/amounts, edit the count and confirm even-split recompute, edit an individual slot's date and amount and confirm both show up correctly on the Payments page.

## Out of Scope

- File upload for cash schedule slots.
- Dropping `contracts.due_day`.
- Any change to PDC contract behavior.
- Changing `rent_payments` generation timing for cash (stays automatic/month-walk-driven, not date-gated like PDC).
