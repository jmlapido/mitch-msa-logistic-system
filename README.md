# MSA Financial, Property & Sponsorship System

A full-stack financial, property, and sponsorship management system built on **Cloudflare Workers + D1 SQLite** (backend) and **React + Vite** (frontend). Designed for managing rental buildings, recurring bills, tenants, sponsorship contracts, and financial reporting in one place.

**Live:** https://mitch-app.jmlapido.workers.dev

---

## Feature List

### Bills Management
- Add, edit, and delete recurring or one-time bills
- Assign bills to categories with custom icons and colors
- Track payment status: Unpaid, Due Soon, Overdue, Paid
- Mark bills as paid with date, invoice number, and notes
- Attach PDF / image invoices to individual bill entries
- Month navigation — view bills for any past or future month
- Yearly unpaid tracker in the sidebar (month-by-month breakdown)

### Bill Categories
- Create and manage bill categories with name, color, and emoji icon
- Flag categories as "building-linked" to show a building picker on bills
- Building badge displayed on linked categories in the settings list

### Building-Linked Bills
- Optionally assign a bill to a specific building when its category requires it
- Filter the bills table by building (client-side, per month)
- Filter the bills report by building (server-side)

### Rentals Management
- **Buildings** — track building name, type, address, unit count, and occupancy
- **Units** — manage unit numbers, floor, type, and occupancy status
- **Tenants** — store tenant contact info, ID, and notes
- **Leases** — create and track lease contracts with start/end dates, monthly rent, and deposit
- **Rent Payments** — log monthly rent payments with status (collected / pending)
- Lease status indicators: Active, Expiring Soon, Expired
- Occupancy summary per building

### Rental Documents
- Upload and manage documents linked to tenants or leases (IDs, contracts, etc.)

### Reports
- **Bills Report** — monthly summary, by-category breakdown, and full detail table
  - Filter by building (server-side)
  - Report subtitle reflects active building filter
- **Rental Report** — rent collection summary by building
- **Combined Report** — bills vs. rent income side-by-side by month
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
- Tracks all create, update, and delete actions on bills
- Viewable by superadmin

### Dashboard
- Quick snapshot of current-month totals: total, paid, unpaid
- Links to bills and rentals

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
| Auth | JWT (jose) |
| Deployment | Wrangler CLI |

---

## Project Structure

```
├── src/                  # Cloudflare Worker (Hono backend)
│   ├── routes/           # API route handlers
│   ├── middleware/       # Auth, role guards
│   └── lib/              # Utilities (audit log, auth helpers)
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── pages/        # Top-level pages (Bills, Rentals, Reports, Settings)
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

# Run tests
npm test
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
