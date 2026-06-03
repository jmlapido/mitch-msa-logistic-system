# MSA Logistic Financial, Property & Sponsorship System

A full-stack financial, property, and sponsorship management system built on **Cloudflare Workers + D1 SQLite** (backend) and **React + Vite** (frontend). Designed for managing rental buildings, recurring bills, tenants, sponsorship contracts, and financial reporting in one place.

**Live:** https://mitch-app.jmlapido.workers.dev

---

## Feature List

### Dashboard
- Monthly snapshot: Bills (total / paid / unpaid), Rent (due / collected / overdue), Sponsorships
- **6-Month Bills Trend** — area chart with total vs unpaid over 6 months
- **6-Month Rent Trend** — area chart with due vs collected, toggle between Monthly and Annual payment frequency
- **Rent Collection by Building** — horizontal bar chart with inline % labels, color-coded by collection rate
- **Bills Donut Chart** — paid vs unpaid breakdown
- **Priority Payments** — unpaid bills ranked by urgency (overdue → due soon → upcoming), with due dates
- **Upcoming Bills** — bills not yet due this month
- **Expiring Leases** — contracts ending within 60 days
- **Building Occupancy** — compact per-building occupied/vacant counts with progress bars
- **Active Sponsors** — live sponsorship status with payment progress bars
- **Expiring Sponsorships (60 days)** — contracts expiring soon with days remaining and expiry date
- Month navigation to view any past or future month
- All widgets navigate to the relevant detail page on click

### Bills Management
- Add, edit, and delete recurring or one-time bills
- Recurring checkbox — due date range adjusts (1–28 for recurring, 1–31 for one-time)
- Assign bills to categories with custom icons and colors
- Track payment status: Unpaid, Due Soon, Overdue, Paid
- Mark bills as paid with date, invoice number, and notes
- Attach PDF / image invoices to individual bill entries
- Month navigation — view bills for any past or future month
- Yearly unpaid tracker in the sidebar (month-by-month breakdown)
- Particulars displayed in Title Case
- **Sortable columns** — click Amount, Due, or Status headers to sort; default is Due ascending; clicking the active column toggles direction

### Bill Categories
- Create and manage bill categories with name, color, and emoji icon
- Flag categories as "building-linked" to show a building picker on bills

### Rentals Management
- **Buildings** — track building name, type, address, unit count, and occupancy
- **Units** — manage unit numbers, floor, type, and occupancy status; click any row to open a centered detail modal with documents panel
- **Tenants** — store tenant contact info, ID, and notes; names displayed in Title Case
- **Contracts** — create and track rental contracts with start/end dates, annual rent, payment type (PDC / Cash), and payment frequency
  - Payment frequencies: **Monthly** (12 payments/yr), **Quarterly** (4), **Semi-annual** (2), **Annual** (1), **Custom** (manual dates)
  - Standard frequencies auto-generate a payment schedule from the contract start date at the correct interval
  - Custom frequency: user sets each payment date individually via the Payment Schedule Panel
  - **Payment Schedule Panel** — per-contract collapsible panel showing each payment slot with date picker, amount field, file upload (PDC cheques), and removal; works for both PDC and Cash contract types
  - **PDC coverage warning** — amber alert on the contract card and schedule panel when the total of entered cheque amounts is less than the annual rent, showing the shortfall amount
- **Rent Payments** — log monthly rent payments; click the status pill (collected / partial / pending / overdue) to open a payment dialog with per-entry history
  - Payments tab stat cards: Expected, Collected, Pending, Total Overdue, **Cash Collected**, **Cheque Collected**
  - Sidebar "By Status" panel showing count and amount per status, plus "By Building" breakdown
  - Payments within **1 AED** of the expected rent are treated as collected (handles rounding on fractional monthly amounts)
  - Payment entries record cash or cheque method; both count equally toward collected/partial status
- Lease status indicators: Active, Expiring Soon, Expired
- Occupancy summary per building

### Rental Documents
- Upload and manage documents linked to tenants or leases (IDs, contracts, etc.)

### Sponsorships (Partners)
- Manage sponsor companies and their contracts
- Track payment frequency (monthly / quarterly / annual / one-time)
- Record payments against contracts
- Active and expiring contract widgets on the dashboard

### Reports
- **Bills Report** — monthly summary, by-category breakdown, and full detail table; filter by building
- **Rental Report** — rent collection summary by building
- **Combined Report** — bills vs. rent income side-by-side by month
- **Outstanding Report** — unpaid balances across all modules
- **Expiring Leases Report** — contracts ending within a configurable range
- Date range selector (from / to month)
- Print / Export to PDF button

### Settings
- **Categories** — full CRUD for bill categories; building-link toggle per category
- **Properties** — manage internal property references for bills
- **Buildings & Units** — read-only view mirroring the Rentals tab for reference

### Authentication & Roles
- JWT-based session authentication
- Roles: `user`, `admin`, `superadmin`
- Admin-only actions: create/edit/delete bills, categories, and contracts
- Superadmin: inline "last edited by" attribution on entries

### Audit Log
- Tracks all create, update, and delete actions
- Filterable by user, action type, entity type, and date range
- Viewable by superadmin

### UI / UX
- All dates displayed and entered in **DD/MM/YYYY** format throughout (custom `DateInput` component — browser-locale independent)
- UAE Dirham symbol rendered as an inline SVG throughout
- Sticky top navigation bar with a two-tone teal gradient (`#28bdb6` shades), light and dark mode variants
- Dark mode toggle — persisted to localStorage
- Responsive layout (mobile + desktop)
- Month navigator controls enlarged for easier use across Dashboard, Bills, and Rentals
- Validation errors surface the actual field message rather than a generic failure string
- Footer: Designed and Developed for MSA Logistic by [JMLapido](https://fb.com/jmlapido)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Cloudflare Workers (Hono framework) |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 |
| Frontend | React 18 + Vite |
| State / data fetching | Tanstack Query v5 |
| Forms | React Hook Form + Zod |
| UI components | Radix UI + Tailwind CSS |
| Charts | Recharts |
| Auth | JWT (jose) |
| Deployment | Wrangler CLI |

---

## Project Structure

```
├── src/                  # Cloudflare Worker (Hono backend)
│   ├── routes/           # API route handlers
│   ├── middleware/        # Auth, role guards
│   └── lib/              # Utilities (audit log, zv validator wrapper, auth helpers)
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── pages/        # Top-level pages (Dashboard, Bills, Rentals, Partners, Reports, Settings)
│   │   ├── components/   # Reusable UI components
│   │   └── lib/          # API client, hooks, utilities
├── migrations/           # D1 SQL migration files
├── schema.sql            # Full database schema reference
└── wrangler.toml         # Cloudflare deployment config
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start backend (Cloudflare Worker dev server on :8787)
npm run dev:api

# Start frontend (Vite dev server on :5173)
npm run dev:client
```

Apply local DB migrations:

```bash
npx wrangler d1 execute mitch-app-db --local --file=migrations/<file>.sql
```

## Deployment

```bash
# Build and deploy to Cloudflare Workers
npm run deploy

# Apply migrations to production D1
npx wrangler d1 execute mitch-app-db --remote --file=migrations/<file>.sql
```

---

*Designed and Developed for MSA Logistic by [JMLapido](https://fb.com/jmlapido)*
