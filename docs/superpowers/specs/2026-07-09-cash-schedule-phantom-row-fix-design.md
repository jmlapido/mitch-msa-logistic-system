# Cash Contract Phantom Row Fix Design

**Date:** 2026-07-09
**Status:** Approved

## Problem

Reported live: tenant Elsayed Emam Abdelnabbi Awwad (contract_id=62, Saeed Plaza unit 102) has a cash contract with `no_of_pdc = 5` and 5 explicitly dated/amounted installments in the schedule panel (11 Mar 2026: 3,000; 7 Jul 2026: 7,500; 7 Aug 2026: 1,167; 7 Sep 2026: 1,166.66; 7 Oct 2026: 1,166.66 — summing to ~14,000, the full annual rent). The lease runs Oct 2025 – Oct 2026 (12 calendar months), but the Payments page shows an Overdue total of 25,400 instead of the ~14,000 the schedule actually calls for.

Root cause: `src/routes/rent-payments.ts`'s `GET /` handler runs two separate row-generation queries. The month-walk `INSERT` (creating one `rent_payments` row per calendar month of the lease) runs unconditionally for every `payment_type = 'cash'` contract, defaulting each row's amount to `annual_rent / no_of_pdc`. A second, slot-driven `INSERT` (creating one row per dated `pdc_cheques` entry, with that entry's own amount) exists but is gated to `payment_frequency = 'custom' OR payment_type = 'pdc'` — cash contracts never use it. So for Elsayed's contract, the calendar walk still stamps a phantom 2,800 "overdue" row onto every one of the 7 months that were never part of the 5-installment plan (Oct/Nov/Dec 2025, Jan/Feb/Apr/May/Jun 2026), inflating Overdue by ~19,600.

This is not isolated: a live scan of every cash contract with at least one dated schedule slot found the same phantom-row pattern on **6 tenants** — Elsayed, ANNAS HUSSAIN, MABROOK TRAVEL LLC, AL RIAH FURNITURE, MOHAMMED SAIFUL ISLAM ABDUL RAZZAK, and MARILOU QUINES MALLARE — anywhere `no_of_pdc` is lower than the number of calendar months the lease spans.

This reverses a Non-Goal in the prior accepted spec (`2026-07-08-cash-payment-count-schedule-design.md`, "no change to `rent_payments` row generation timing for cash"). That spec assumed cash schedules would always be used to annotate specific months that already exist via the calendar walk. In practice, cash contracts are also used with genuinely non-monthly schedules (fewer installments than calendar months, spread unevenly) — the governing rule agreed here is: **once a cash contract has a dated schedule, the schedule is the sole source of truth for which months are owed and how much.**

## Goals

- Once a cash contract has at least one dated `pdc_cheques` slot, stop the calendar month-walk from creating any further rows for it; only dated slots generate rows, exactly matching how `payment_type = 'pdc'` contracts already behave.
- Cash contracts with zero dated slots (schedule panel never touched) are completely unaffected — they keep the plain monthly walk exactly as today.
- Clean up existing phantom rows (zero paid, no entries, month not matching any dated slot) on all currently-affected cash contracts, without touching any row that has a real payment recorded against it, regardless of whether that row's month matches a slot.

## Non-Goals

- Auto-persisting default schedule slots at contract creation time. Since the switch to slot-driven generation is gated on "at least one dated slot exists," an untouched contract simply never triggers the switch — no new default-persistence mechanism is needed.
- Any change to PDC contract behavior — untouched.
- Any change to the amount-sync `UPDATE`, `expected_rent` display `CASE`, or `tenant_overdue`/`balance` calculations in `rent-payments.ts` — all already read whatever `rent_payments.amount` ends up stored, so they self-correct once phantom-row generation stops.
- Retroactively deleting or altering any row with `amount_paid > 0` or any existing `payment_entries`, even if its month doesn't match a scheduled slot (e.g., MABROOK TRAVEL LLC's April 2026 row has 3,000 paid with no matching slot — this stays exactly as-is).

## 1. Backend generation changes (`src/routes/rent-payments.ts`)

- **Calendar month-walk `INSERT`** (the recursive-CTE query that currently creates one row per calendar month for every `payment_type = 'cash'` contract): add `AND NOT EXISTS (SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL)` to its `WHERE` clause. Once any slot on a contract has a date, this query stops inserting new rows for that contract — permanently, since a contract cannot lose its already-dated slots except through direct schedule-panel edits, which is out of scope here.
- **Slot-driven `INSERT`** (currently gated `WHERE (c.payment_frequency = 'custom' OR c.payment_type = 'pdc') AND pc.cheque_date IS NOT NULL AND ...`): widen the gate to `WHERE (c.payment_frequency = 'custom' OR c.payment_type = 'pdc' OR c.payment_type = 'cash') AND pc.cheque_date IS NOT NULL AND ...`. Because the query already `JOIN`s `pdc_cheques` and requires `cheque_date IS NOT NULL`, this remains a no-op for any cash contract with zero dated slots — no behavior change for untouched contracts.
- **Default-amount divisor** in that same slot-driven `INSERT`: currently `ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)` for PDC/custom contracts. Apply the identical formula for cash (dated-slot count as divisor), rather than the previously-planned `annual_rent / no_of_pdc` stored-count divisor — for consistency, since cash now behaves identically to PDC once scheduled. This only affects a slot's default amount before it has been explicitly saved; once the admin sets a real per-slot amount, the existing amount-sync `UPDATE` overwrites it as before.

## 2. Cleanup migration (new `migrations/0014-cash-phantom-row-cleanup.sql`)

```sql
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

A row is only deleted if it is simultaneously: on a cash contract that has at least one dated slot; zero paid; status `pending` or `overdue` (never `partial` or `collected`); its month matches no dated slot on that contract; and it has zero `payment_entries` ever recorded against it (belt-and-suspenders alongside the `amount_paid = 0` check). This mirrors the existing stale-PDC-row cleanup pattern already in this file (`rent-payments.ts` ~45-64).

Based on the live scan performed during design, this is expected to remove phantom rows from: Elsayed Emam Abdelnabbi Awwad (7 rows), ANNAS HUSSAIN (3 rows), MABROOK TRAVEL LLC (6 rows), AL RIAH FURNITURE (8 rows), MOHAMMED SAIFUL ISLAM ABDUL RAZZAK (9 rows), MARILOU QUINES MALLARE (1 row).

## Testing

- No existing automated test coverage touches `rent-payments.ts`'s SQL (consistent with the rest of this route file, per the prior cash-payment-count-schedule spec) — verification is manual.
- Before applying the cleanup migration, run its `SELECT` form (swap `DELETE FROM rent_payments WHERE id IN (...)` for `SELECT rp.id, c.id as contract_id, rp.month, rp.amount FROM ... WHERE id IN (...)`, or just run the inner `SELECT` directly) against the **remote** D1 database and cross-check the returned row count/tenants against the manual scan in this doc's Problem section before running the real `DELETE`.
- After deploying the code change and running the migration, live-verify via the Payments page (or direct D1 query) that: Elsayed's Overdue total is now ~0 (5 scheduled installments, none yet due/paid) or matches whatever installments have actually come due; the other 5 affected tenants' Overdue totals dropped by the expected phantom amounts; no tenant's `amount_paid` or entry history changed.
- Separately, live-verify the generation-logic change going forward: on a cash contract with a dated schedule, navigating to a future month with no existing row must NOT create a new row unless a slot is dated for that month; navigating to a future month that does have a dated slot must create exactly one row with that slot's amount.
