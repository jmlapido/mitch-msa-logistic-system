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
- Recurring checkbox positioned before due date — due date range adjusts (1–28 for recurring, 1–31 for one-time)
- Assign bills to categories with custom icons and colors
- Track payment status: Unpaid, Due Soon, Overdue, Paid
- Mark bills as paid with date, invoice number, and notes
- Attach PDF / image invoices to individual bill entries
- Month navigation — view bills for any past or future month
- Yearly unpaid tracker in the sidebar (month-by-month breakdown)
- Particulars displayed in Title Case

### Bill Categories
- Create and manage bill categories with name, color, and emoji icon
- Flag categories as "building-linked" to show a building picker on bills

### Rentals Management
- **Buildings** — track building name, type, address, unit count, and occupancy
- **Units** — manage unit numbers, floor, type, and occupancy status; click any row to open a centered detail modal with documents panel
- **Tenants** — store tenant contact info, ID, and notes; names displayed in Title Case
- **Leases** — create and track lease contracts with start/end dates, monthly rent, and deposit
- **Rent Payments** — log monthly rent payments; click the status pill (collected / partial / pending / overdue) to open a centered payment dialog
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
- Admin-only actions: create/edit/delete bills and categories
- Superadmin: inline "last edited by" attribution on bill entries

### Audit Log
- Tracks all create, update, and delete actions
- Viewable by superadmin

### UI / UX
- UAE Dirham symbol rendered as an inline SVG throughout
- Sticky top navigation bar with a two-tone teal gradient (`#28bdb6` shades), light and dark mode variants
- Dark mode toggle — persisted to localStorage
- Responsive layout (mobile + desktop)
- Month navigator controls enlarged for easier use across Dashboard, Bills, and Rentals
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
│   └── lib/              # Utilities (audit log, auth helpers)
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
