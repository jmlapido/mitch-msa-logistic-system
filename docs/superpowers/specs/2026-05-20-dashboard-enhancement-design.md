# Dashboard Enhancement Design

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Enhance the main dashboard to be information-rich with charts, richer stat cards, and sponsorship visibility. All items are clickable and navigate to the relevant page or specific record.

---

## Layout Structure

```
[Page Header: "Dashboard" + Month Nav]

[Section: Bills & Rent]
[6 Stat Cards: Total Bills | Bills Paid | Bills Unpaid | Rent Due | Rent Collected | Overdue Rent]

[Section: Sponsorships]
[4 Stat Cards: Contract Value | Collected | Pending | Overdue]

[Charts Row: Bills Donut (1fr) | Rent by Building Bar Chart (1.7fr)]

[Area Chart: 6-Month Bills Trend — full width]

[Widget Row 1 (3 cols): Priority Payments | Upcoming Bills | Expiring Leases]

[Section: Sponsorship Widgets]
[Widget Row 2 (2 cols): Active Sponsors | Expiring Sponsorships (90 days)]
```

---

## Stat Cards

### Bills & Rent Row (6 cards)

| Card | Value | Delta | Navigation |
|---|---|---|---|
| Total Bills | `formatAED(bills.total)` | `± % vs prev month` | `/bills` |
| Bills Paid | `formatAED(bills.paid)` | `% paid rate` | `/bills?status=paid` |
| Bills Unpaid | `formatAED(bills.unpaid)` | count of unpaid entries | `/bills?status=unpaid` |
| Rent Due | `formatAED(rent.due)` | unit count | `/rentals` |
| Rent Collected | `formatAED(rent.collected)` | collection rate % | `/rentals` |
| Overdue Rent | `formatAED(rent.overdue)` | overdue tenant count | `/rentals` |

Each card has a colored top border (3px) and trend delta below the value. Color-coded: blue (neutral), green (positive), red (negative), amber (warning), teal (info).

### Sponsorships Row (4 cards)

| Card | Value | Delta | Navigation |
|---|---|---|---|
| Contract Value | total `expected_amount` of active contracts | active sponsor count | `/partners` |
| Collected | total payments received across active contracts | collection rate % | `/partners` |
| Pending | expected minus collected (non-overdue) | partial + pending count | `/partners` |
| Overdue | amount overdue across all partners | overdue sponsor count | `/partners` |

---

## Charts

### Bills Breakdown (Donut — Recharts `PieChart`)

- Two segments: Paid (green `#22c55e`) and Unpaid (red `#ef4444`)
- Center label: collection rate % + "paid"
- Legend: AED amounts for each segment
- Clickable: navigates to `/bills`
- Data: existing `data.bills.{paid, unpaid, total}`

### Rent Collection by Building (Bar Chart — Recharts `BarChart`)

- Horizontal layout: one bar per building
- Bar color: green ≥ 80%, amber 50–79%, red < 50%
- Shows collection % per building, tooltip shows collected / expected AED
- Each row clickable → `/rentals?building={id}`
- Data: existing `data.rentByBuilding`

### 6-Month Bills Trend (Area Chart — Recharts `AreaChart`)

- Two areas: Total Bills (solid blue `#3b82f6`) and Unpaid (dashed amber `#f59e0b`)
- X-axis: last 6 months labels
- Tooltip: AED amounts for both lines on hover
- Full-width card, chart clickable → `/bills`
- **New API data required:** 6-month history query (see Backend Changes)

---

## Widgets

### Widget Row 1 — Bills & Rent (3 columns)

**Priority Payments** (existing, unchanged data)
- Each row clickable → `/bills` (scroll to / highlight that entry via `?highlight={entry_id}`)

**Upcoming Bills** (existing, unchanged data)
- Each row clickable → `/bills?highlight={entry_id}`

**Expiring Leases** (enhanced)
- Days-remaining badge replaces plain date: red < 14 days, amber < 30 days, blue ≥ 30 days
- Each row clickable → `/rentals?tenant={id}` (opens tenant record)

### Widget Row 2 — Sponsorships (2 columns)

**Active Sponsors** (new widget)
- Lists active partners with latest contract payment status
- Paid: green badge + total amount
- Partial/Overdue: status badge + mini horizontal progress bar (collected / expected)
- Pending: amber badge + expected amount
- Each row clickable → `/partners?partner={id}` (opens partner record)

**Expiring Sponsorships — 90 days** (new widget)
- Lists partner contracts expiring within 90 days
- Shows: partner name, payment frequency, annual value, end date
- Days-remaining badge: red < 14d, amber < 30d, blue ≥ 30d
- Payment status badge alongside days badge
- Each row clickable → `/partners?partner={id}`

---

## Navigation Implementation

Dashboard items use `react-router-dom` `useNavigate`. Stat cards and charts use `onClick={() => navigate(path)}` with `cursor-pointer` styling. Widget rows use the same pattern. No new routes needed — existing pages handle filter params via `useSearchParams`.

Hover state for all clickable items:
- Stat cards: `translateY(-1px)` + colored border glow
- Widget rows: `background: hsl(var(--muted))` + `›` arrow reveals on right
- Bar chart rows: row highlight + `›` arrow reveals

---

## Backend Changes

### Existing `/api/dashboard` endpoint — additions

**1. Sponsorships summary** (new query)

```sql
SELECT
  COUNT(DISTINCT p.id) as active_sponsors,
  COALESCE(SUM(pc.expected_amount), 0) as total_contract_value,
  COALESCE(SUM(pp_totals.total_paid), 0) as total_collected,
  COALESCE(SUM(
    CASE WHEN date(pc.end_date) < date('now')
              AND COALESCE(pp_totals.total_paid, 0) < pc.expected_amount
         THEN pc.expected_amount - COALESCE(pp_totals.total_paid, 0)
         ELSE 0 END
  ), 0) as total_overdue
FROM partners p
JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
LEFT JOIN (
  SELECT contract_id, SUM(amount) as total_paid
  FROM partner_payments GROUP BY contract_id
) pp_totals ON pp_totals.contract_id = pc.id
WHERE p.is_archived = 0
```

**2. Active sponsors list** (new query — up to 8 rows)

```sql
SELECT p.id as partner_id, p.company_name,
  pc.id as contract_id, pc.expected_amount, pc.payment_frequency,
  pc.end_date as contract_end,
  COALESCE(pp.total_paid, 0) as total_paid,
  CASE
    WHEN COALESCE(pp.total_paid, 0) >= pc.expected_amount THEN 'paid'
    WHEN date(pc.end_date) < date('now') AND COALESCE(pp.total_paid, 0) < pc.expected_amount THEN 'overdue'
    WHEN COALESCE(pp.total_paid, 0) > 0 THEN 'partial'
    ELSE 'pending'
  END as status
FROM partners p
JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
LEFT JOIN (
  SELECT contract_id, SUM(amount) as total_paid
  FROM partner_payments GROUP BY contract_id
) pp ON pp.contract_id = pc.id
WHERE p.is_archived = 0
ORDER BY p.company_name
LIMIT 8
```

**3. Expiring sponsorships** (new query)

```sql
SELECT p.id as partner_id, p.company_name,
  pc.end_date, pc.expected_amount, pc.payment_frequency,
  COALESCE(pp.total_paid, 0) as total_paid,
  CAST(julianday(pc.end_date) - julianday('now') AS INTEGER) as days_remaining,
  CASE
    WHEN COALESCE(pp.total_paid, 0) >= pc.expected_amount THEN 'paid'
    WHEN date(pc.end_date) < date('now') AND COALESCE(pp.total_paid, 0) < pc.expected_amount THEN 'overdue'
    WHEN COALESCE(pp.total_paid, 0) > 0 THEN 'partial'
    ELSE 'pending'
  END as status
FROM partners p
JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
LEFT JOIN (
  SELECT contract_id, SUM(amount) as total_paid
  FROM partner_payments GROUP BY contract_id
) pp ON pp.contract_id = pc.id
WHERE date(pc.end_date) BETWEEN date('now') AND date('now', '+90 days')
  AND p.is_archived = 0
ORDER BY pc.end_date
LIMIT 8
```

**4. 6-month bills history** (new query)

```sql
SELECT month,
  COALESCE(SUM(amount), 0) as total,
  COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) as unpaid
FROM bill_entries
WHERE month >= strftime('%Y-%m', date('now', '-5 months'))
GROUP BY month
ORDER BY month
```

**5. Stat card trend deltas** (new query)

Fetch the previous month's `bills.total`, `bills.paid`, `rent.collected` to compute `± %` deltas for the stat cards.

---

## Frontend Changes

### New / Modified Files

| File | Change |
|---|---|
| `src/routes/dashboard.ts` | Add 5 new queries above; extend response shape |
| `client/src/lib/hooks/useDashboard.ts` | Extend `DashboardData` type with new fields |
| `client/src/pages/Dashboard.tsx` | Add new sections, wire up `useNavigate`, layout restructure |
| `client/src/components/dashboard/StatCard.tsx` | Add `onClick` prop, `delta` prop with up/down/neutral display |
| `client/src/components/dashboard/BillsDonutChart.tsx` | New component — Recharts `PieChart` |
| `client/src/components/dashboard/RentBarChart.tsx` | New component — Recharts `BarChart` |
| `client/src/components/dashboard/BillsTrendChart.tsx` | New component — Recharts `AreaChart` |
| `client/src/components/dashboard/SponsorshipStatCards.tsx` | New component — 4-card sponsorship row |
| `client/src/components/dashboard/ActiveSponsorsWidget.tsx` | New component — sponsor list with progress bars |
| `client/src/components/dashboard/ExpiringSponsorsWidget.tsx` | New component — expiring contracts list |
| `client/src/components/dashboard/ExpiringLeasesWidget.tsx` | Enhance: days badge, `onClick` per row |
| `client/src/components/dashboard/PriorityPaymentsWidget.tsx` | Enhance: `onClick` per row |
| `client/src/components/dashboard/UpcomingBillsWidget.tsx` | Enhance: `onClick` per row |
| `client/src/components/dashboard/RentSummaryWidget.tsx` | Remove — replaced by `RentBarChart` |

### Navigation Params

The following destination pages need minor additions to read URL params (none currently do):

- **Bills page** (`client/src/pages/Bills.tsx`): read `?status=paid|unpaid` to pre-filter the status dropdown; read `?highlight={entry_id}` to scroll to and visually highlight that row
- **Rentals page** (`client/src/pages/Rentals.tsx`): read `?building={id}` to pre-select the building tab; read `?tenant={id}` to open the tenant detail panel
- **Partners page** (`client/src/pages/Partners.tsx`): read `?partner={id}` to open the partner detail panel

These are shallow additions — one `useSearchParams()` call per page to read the param on mount.

---

## Data Shape Extension (DashboardData)

```ts
type DashboardData = {
  // existing fields unchanged ...
  billsHistory: Array<{ month: string; total: number; unpaid: number }>;
  prevMonth: { bills: { total: number; paid: number }; rent: { collected: number } };
  sponsorships: {
    totalContractValue: number;
    collected: number;
    pending: number;
    overdue: number;
    activeCount: number;
  };
  activeSponsors: Array<{
    partner_id: number; company_name: string;
    expected_amount: number; total_paid: number;
    payment_frequency: string; contract_end: string; status: string;
  }>;
  expiringSponsors: Array<{
    partner_id: number; company_name: string;
    end_date: string; expected_amount: number;
    payment_frequency: string; total_paid: number;
    days_remaining: number; status: string;
  }>;
};
```

---

## No New Dependencies

Recharts (`^2.13.3`) is already installed. No additional packages required.
