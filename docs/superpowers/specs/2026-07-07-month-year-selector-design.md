# Month/Year Selector Design

**Date:** 2026-07-07
**Status:** Approved

## Problem

Both the Bills page (`client/src/pages/Bills.tsx`) and the Rentals payments tab (`client/src/components/rentals/tabs/PaymentsTab.tsx`) let the user browse data by month, but the only navigation is a pair of prev/next chevron arrows stepping one month at a time:

```ts
// duplicated verbatim in Bills.tsx:41-45 and PaymentsTab.tsx:30-34
function changeMonth(delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta);
  setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}
```

```tsx
// duplicated verbatim in Bills.tsx:56-58 and PaymentsTab.tsx:78-80
<button onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
<span className="text-base font-semibold w-36 text-center">{monthLabel(month)}</span>
<button onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
```

Jumping to a month several months or years away requires clicking the arrow repeatedly. There's no way to jump directly to an arbitrary month/year.

## Goals

- Let the user pick any month/year directly, on both the Bills page and the Rentals payments tab.
- Keep the existing prev/next arrows for quick ±1 month nudges.
- Remove the duplicated month-stepping logic and arrow/label markup between the two pages by extracting a shared component.

## Non-Goals

- `Reports.tsx` — it only uses `currentMonth()` as a default value with no month-navigation UI of its own; not touched by this change.
- A calendar-grid or native `<input type="month">` picker — two dropdowns (month + year) were chosen over these alternatives for simplicity and full control over styling/behavior.
- Any backend change — `useBillEntries(month)` and `useRentPayments(month, buildingFilter)` already accept a `YYYY-MM` string; nothing about how `month` is consumed changes.

---

## Component

**New file:** `client/src/components/ui/MonthYearSelector.tsx`

```ts
interface MonthYearSelectorProps {
  month: string;          // 'YYYY-MM'
  onChange: (month: string) => void;
}
```

Renders, in order: prev arrow, month `<select>`, year `<select>`, next arrow — replacing the arrow+label markup quoted above in both call sites.

- **Prev/next arrows**: same ±1 month stepping logic as today's `changeMonth`, now owned by this component. Calls `onChange` with the new `YYYY-MM`.
- **Month dropdown**: 12 fixed options (Jan–Dec), labeled with `Intl.DateTimeFormat('en-AE', { month: 'long' })` — the same locale already used by `monthLabel` in `client/src/lib/utils.ts:32-36`. Selecting an option keeps the current year and calls `onChange`.
- **Year dropdown**: options range from `currentYear - 5` to `currentYear + 1` (7 options, `currentYear` read once via `new Date()` at mount). If the `month` prop's year falls outside that window — which can only happen by arrow-paging past the edge — the window is widened on the fly to include it (e.g. `min(currentYear - 5, selectedYear)` .. `max(currentYear + 1, selectedYear)`), so the dropdown never needs to render a selected value that isn't one of its own options. Selecting a year keeps the current month and calls `onChange`.
- No internal state beyond the derived dropdown option lists — `month` remains fully controlled by the parent, matching the existing `useState(currentMonth())` pattern in both pages.

## Integration

- `Bills.tsx`: delete `changeMonth` (lines 41-45) and the arrow/label JSX (lines 56-58); render `<MonthYearSelector month={month} onChange={setMonth} />` in their place. No other change — `useBillEntries(month)` keeps consuming `month` as-is.
- `PaymentsTab.tsx`: same replacement for lines 30-34 and 78-80. No other change — `useRentPayments(month, buildingFilter)` keeps consuming `month` as-is.
- Both pages keep their own `useState(currentMonth())` and pass `setMonth` straight through as `onChange`.

## Testing

New `client/src/components/ui/MonthYearSelector.test.ts`, following the pattern of the existing component tests (`client/src/components/dashboard/StatCard.test.ts`), covering:

1. Clicking prev/next steps the month by one, wrapping year boundaries correctly (e.g. Jan 2026 → Dec 2025).
2. Selecting a month from the dropdown keeps the year and calls `onChange` with the new value.
3. Selecting a year from the dropdown keeps the month and calls `onChange` with the new value.
4. When `month` is outside the default `[currentYear-5, currentYear+1]` window, the year dropdown still lists (and can select) the current value without throwing or silently clamping it.

---

## Out of Scope

- `Reports.tsx`.
- Native `<input type="month">` or calendar-popover styles (considered and rejected in favor of two dropdowns).
- Data-driven year range (e.g. derived from earliest contract/bill record) — the fixed window was chosen over this for simplicity.
