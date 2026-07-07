# Month/Year Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users jump directly to any month/year on the Bills and Rentals (PaymentsTab) pages via a shared month+year dropdown selector, replacing the duplicated one-month-at-a-time arrow logic on both pages.

**Architecture:** A single new component, `MonthYearSelector`, exports both the rendered control (prev arrow, month `<select>`, year `<select>`, next arrow) and four pure helper functions (`stepMonth`, `withMonth`, `withYear`, `getYearOptions`) that the component's event handlers call into. The pure functions carry all the logic and are unit-tested directly, following this codebase's existing convention (see `client/src/components/dashboard/StatCard.tsx` / `StatCard.test.ts`, where the pure `deltaClass` helper is exported and tested, not the rendered component). `Bills.tsx` and `PaymentsTab.tsx` each replace their local `changeMonth` function and inline arrow/label JSX with `<MonthYearSelector month={month} onChange={setMonth} />`.

**Tech Stack:** React + TypeScript, native HTML `<select>` (matches the existing `buildingFilter` select in `PaymentsTab.tsx:82-86` — this codebase does not use the Radix `ui/select.tsx` wrapper for simple filter dropdowns), Vitest for unit tests, Tailwind for styling.

## Global Constraints

- Month values are always `YYYY-MM` strings (e.g. `'2026-07''`), matching `currentMonth()`/`monthLabel()` in `client/src/lib/utils.ts`.
- Year dropdown default range: `[currentYear - 5, currentYear + 1]`, widened to include the currently selected year if it falls outside that window.
- No backend changes. No changes to `Reports.tsx`.
- Follow existing button/select Tailwind classes exactly as used today (`p-1.5 rounded-md hover:bg-muted transition-colors` for arrow buttons; `text-xs px-2 py-1 rounded border bg-background border-border` for selects).
- Baseline note: `npx tsc --noEmit -p client/tsconfig.json` on `master` before this work already reports 25 lines of pre-existing errors (`PartnersTab.tsx`, `TenantsTab.tsx`, `useRentals.ts`, `Settings.tsx`) unrelated to this feature. Every type-check step in this plan means "no *new* errors beyond that existing baseline," not zero errors overall.

---

### Task 1: Pure helper functions for MonthYearSelector

**Files:**
- Create: `client/src/components/ui/MonthYearSelector.tsx`
- Test: `client/src/components/ui/MonthYearSelector.test.ts`

**Interfaces:**
- Produces: `stepMonth(month: string, delta: number): string`, `withMonth(month: string, newMonthPart: string): string`, `withYear(month: string, newYear: number): string`, `getYearOptions(month: string, now?: Date): number[]` — all exported from `client/src/components/ui/MonthYearSelector.tsx`. Task 2 imports these into the component.

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/ui/MonthYearSelector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepMonth, withMonth, withYear, getYearOptions } from './MonthYearSelector';

describe('stepMonth', () => {
  it('steps forward within a year', () => {
    expect(stepMonth('2026-03', 1)).toBe('2026-04');
  });
  it('steps backward within a year', () => {
    expect(stepMonth('2026-03', -1)).toBe('2026-02');
  });
  it('rolls forward across a year boundary', () => {
    expect(stepMonth('2025-12', 1)).toBe('2026-01');
  });
  it('rolls backward across a year boundary', () => {
    expect(stepMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('withMonth', () => {
  it('replaces the month part and keeps the year', () => {
    expect(withMonth('2026-03', '11')).toBe('2026-11');
  });
});

describe('withYear', () => {
  it('replaces the year part and keeps the month', () => {
    expect(withYear('2026-03', 2030)).toBe('2030-03');
  });
});

describe('getYearOptions', () => {
  const now = new Date(2026, 6, 7); // 2026-07-07, matches this plan's "today"

  it('returns a window from currentYear-5 to currentYear+1 when selected year is inside it', () => {
    expect(getYearOptions('2026-03', now)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  });

  it('widens the window downward to include a selected year below the default range', () => {
    expect(getYearOptions('2015-03', now)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  });

  it('widens the window upward to include a selected year above the default range', () => {
    expect(getYearOptions('2030-03', now)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- MonthYearSelector`
Expected: FAIL — `client/src/components/ui/MonthYearSelector.tsx` does not exist yet (module not found).

- [ ] **Step 3: Implement the pure helper functions**

Create `client/src/components/ui/MonthYearSelector.tsx` with just the helpers for now (the component itself is added in Task 2):

```tsx
export function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function withMonth(month: string, newMonthPart: string): string {
  const [y] = month.split('-');
  return `${y}-${newMonthPart}`;
}

export function withYear(month: string, newYear: number): string {
  const [, m] = month.split('-');
  return `${newYear}-${m}`;
}

export function getYearOptions(month: string, now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  const selectedYear = Number(month.split('-')[0]);
  const min = Math.min(currentYear - 5, selectedYear);
  const max = Math.max(currentYear + 1, selectedYear);
  const years: number[] = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- MonthYearSelector`
Expected: PASS — all 9 test cases green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui/MonthYearSelector.tsx client/src/components/ui/MonthYearSelector.test.ts
git commit -m "feat: add MonthYearSelector date-math helpers"
```

---

### Task 2: MonthYearSelector rendered component

**Files:**
- Modify: `client/src/components/ui/MonthYearSelector.tsx` (add the component below the helpers from Task 1)

**Interfaces:**
- Consumes: `stepMonth`, `withMonth`, `withYear`, `getYearOptions` from Task 1 (same file).
- Produces: `export function MonthYearSelector({ month, onChange }: { month: string; onChange: (month: string) => void }): JSX.Element` — Tasks 3 and 4 import this.

- [ ] **Step 1: Add the component**

Append to `client/src/components/ui/MonthYearSelector.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const value = String(i + 1).padStart(2, '0');
  const label = new Intl.DateTimeFormat('en-AE', { month: 'long' }).format(new Date(2000, i, 1));
  return { value, label };
});

interface MonthYearSelectorProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthYearSelector({ month, onChange }: MonthYearSelectorProps) {
  const [year, monthPart] = month.split('-');
  const years = getYearOptions(month);

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(stepMonth(month, -1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
        <ChevronLeft size={20} />
      </button>
      <select
        value={monthPart}
        onChange={e => onChange(withMonth(month, e.target.value))}
        className="text-xs px-2 py-1 rounded border bg-background border-border"
      >
        {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select
        value={year}
        onChange={e => onChange(withYear(month, Number(e.target.value)))}
        className="text-xs px-2 py-1 rounded border bg-background border-border"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={() => onChange(stepMonth(month, 1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
```

Move the `import { ChevronLeft, ChevronRight } from 'lucide-react';` line to the top of the file alongside any other imports (it's shown here inline for clarity but must live at the top per normal ES module rules).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: Same 25 lines of pre-existing baseline errors as before this task (see Global Constraints); nothing new referencing `MonthYearSelector.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/MonthYearSelector.tsx
git commit -m "feat: render MonthYearSelector control"
```

---

### Task 3: Integrate into Bills page

**Files:**
- Modify: `client/src/pages/Bills.tsx`

**Interfaces:**
- Consumes: `MonthYearSelector` from `client/src/components/ui/MonthYearSelector` (Task 2). Existing `month`/`setMonth` state (`Bills.tsx:27`) is unchanged — same `useState(currentMonth())`.

- [ ] **Step 1: Update imports**

In `client/src/pages/Bills.tsx`, change line 2 and line 9:

```tsx
// before
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
...
import { currentMonth, monthLabel } from '@/lib/utils';

// after
import { Plus } from 'lucide-react';
...
import { currentMonth } from '@/lib/utils';
```

Add a new import for the selector, near the other component imports:

```tsx
import { MonthYearSelector } from '@/components/ui/MonthYearSelector';
```

- [ ] **Step 2: Remove `changeMonth` and replace the arrow/label JSX**

Delete the `changeMonth` function (`Bills.tsx:41-45`):

```tsx
// delete this whole function
function changeMonth(delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta);
  setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}
```

Replace the arrow/label block (`Bills.tsx:55-59`):

```tsx
// before
<div className="flex items-center gap-1 mt-1">
  <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronLeft size={20} /></button>
  <span className="text-base font-semibold w-36 text-center">{monthLabel(month)}</span>
  <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronRight size={20} /></button>
</div>

// after
<div className="mt-1">
  <MonthYearSelector month={month} onChange={setMonth} />
</div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: Same 25 lines of pre-existing baseline errors as before this task; nothing new referencing `Bills.tsx` (this codebase's `tsc` run does not flag unused imports by default — checking the output has no new `Bills.tsx` lines is the actual signal that the edit is clean).

- [ ] **Step 4: Manual verification**

Run: `npm run dev:client`, open the Bills page in a browser.
Expected: month/year selects appear next to the prev/next arrows; changing either select updates the displayed month and reloads the bill entries for that month; arrows still step ±1 month.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Bills.tsx
git commit -m "feat: use MonthYearSelector on Bills page"
```

---

### Task 4: Integrate into Rentals PaymentsTab

**Files:**
- Modify: `client/src/components/rentals/tabs/PaymentsTab.tsx`

**Interfaces:**
- Consumes: `MonthYearSelector` from `client/src/components/ui/MonthYearSelector` (Task 2). Existing `month`/`setMonth` state (`PaymentsTab.tsx:23`) is unchanged. `monthLabel` import stays (still used at `PaymentsTab.tsx:354` for the payment dialog title) — only `ChevronLeft`/`ChevronRight` are dropped from the `lucide-react` import.

- [ ] **Step 1: Update imports**

In `client/src/components/rentals/tabs/PaymentsTab.tsx`, change line 2:

```tsx
// before
import { ChevronLeft, ChevronRight, Check, Phone, Mail, Building2 } from 'lucide-react';

// after
import { Check, Phone, Mail, Building2 } from 'lucide-react';
```

Add a new import for the selector, near the other component imports (e.g. after line 10's `ContractsPanel` import):

```tsx
import { MonthYearSelector } from '@/components/ui/MonthYearSelector';
```

- [ ] **Step 2: Remove `changeMonth` and replace the arrow/label JSX**

Delete the `changeMonth` function (`PaymentsTab.tsx:30-34`):

```tsx
// delete this whole function
function changeMonth(delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta);
  setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}
```

Replace the arrow/label block (`PaymentsTab.tsx:77-81`):

```tsx
// before
<div className="flex items-center gap-1">
  <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronLeft size={20} /></button>
  <span className="text-base font-semibold w-36 text-center">{monthLabel(month)}</span>
  <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronRight size={20} /></button>
</div>

// after
<MonthYearSelector month={month} onChange={setMonth} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: Same 25 lines of pre-existing baseline errors as before this task; nothing new referencing `PaymentsTab.tsx` (`noUnusedLocals` is off in `client/tsconfig.json`, so `tsc` won't itself flag an unused `ChevronLeft`/`ChevronRight` import if one were left behind by mistake — visually confirm the import line was actually edited as shown in Step 1).

- [ ] **Step 4: Manual verification**

Run: `npm run dev:client`, open the Rentals page, select the Payments tab.
Expected: month/year selects appear next to the prev/next arrows and the building filter; changing either select updates the displayed month and reloads the rent payments table for that month; arrows still step ±1 month; the per-tenant payment dialog title (which uses `monthLabel`) still renders correctly.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/rentals/tabs/PaymentsTab.tsx
git commit -m "feat: use MonthYearSelector on Rentals payments tab"
```

---

### Task 5: Full test suite verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the new `MonthYearSelector.test.ts` cases and all pre-existing tests (no regressions).

- [ ] **Step 2: Run the type-checker across the whole project**

Run: `npx tsc --noEmit -p client/tsconfig.json && npx tsc --noEmit -p tsconfig.json`
Expected: Client check shows only the same 25 lines of pre-existing baseline errors (see Global Constraints); root `tsconfig.json` (server code, untouched by this plan) shows whatever it already shows on `master`.

- [ ] **Step 3: Commit (only if either command required fixes)**

If Steps 1-2 were already clean, skip this step — there's nothing to commit. Otherwise:

```bash
git add -A
git commit -m "fix: address MonthYearSelector integration issues"
```

---

## Self-Review Notes

- **Spec coverage:** Component with dropdowns + arrows (Tasks 1-2), Bills integration (Task 3), PaymentsTab integration (Task 4), fixed year window with widen-on-selection (Task 1's `getYearOptions`), tests for arrow stepping / dropdown selection / widen-window edge case (Task 1's test file covers all four scenarios from the spec's Testing section via the pure helpers). `Reports.tsx` explicitly out of scope, untouched.
- **Type consistency:** `month: string` and `onChange: (month: string) => void` are used identically in the `MonthYearSelectorProps` interface (Task 2) and both call sites (Tasks 3-4, `<MonthYearSelector month={month} onChange={setMonth} />`), matching the existing `useState(currentMonth())` shape in both pages.
- **No placeholders:** every step shows complete, exact code and exact before/after diffs against the real current file contents (verified by reading both files during planning).
