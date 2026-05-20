# Partners Feature Design

**Date:** 2026-05-20  
**Status:** Approved

---

## Overview

A new **Partners** page for tracking companies that pay the business a partnership fee. Partners are entirely separate from the rentals system — no buildings or units. The feature covers partner management, contract tracking, payment recording (with cheque copy attachments), and a Partners report tab.

---

## Page Structure

The Partners page (`/partners`) has two tabs:

### 1. Partners Tab (card grid)
- Displays all partners as cards, similar to BuildingsTab in Rentals.
- Each card shows: company name, email, phone, total collected, active contract expiry, and a paid/partial/overdue badge.
- Overdue cards are highlighted with a red background.
- Sort options: company name A–Z, total collected, status.
- Filter options: by status (all / paid / partial / overdue).
- Search: by company name.
- Admin/superadmin can add, edit, delete partners.
- Clicking a card opens the Partner Detail Modal.

### 2. Payments Tab (flat list)
- Shows all payments across all partners in a single table.
- Stat cards at the top: Total Partners, Total Collected, Pending/Partial, Overdue.
- Filters: by partner, date range (from/to month), status.
- Table columns: Partner, Contract, Amount, Date, Method, Receipt, Status.
- Overdue rows (contract due date passed, zero payment recorded) are highlighted red.
- Status is computed: paid = total payments ≥ contract expected_amount; partial = some payment but less than expected; overdue = contract end_date has passed and total < expected.

---

## Partner Detail Modal

Opens when clicking a partner card. Contains four sections in a two-column layout:

**Left column:**
- Partner Info: company name, email, phone, notes.
- Contact Persons: list of contacts (name, position, phone). Add/edit/delete inline. Multiple contacts per partner.
- Documents: uploaded files (contracts, agreements, other). Upload to R2 bucket. Download/delete.

**Right column:**
- Contracts: list of all contracts for this partner (start date, end date, expected amount, payment frequency, notes, status). Add/edit/delete. One active contract at a time is the norm but multiple historical contracts are supported.
- Payment History: table of all payments linked to this partner (date, amount, method, receipt no, cheque copy attachment). Add payment button opens an inline form. Delete payment entries. Cheque copy files upload to R2.

---

## Data Model

Six new tables added via a migration:

```sql
CREATE TABLE partners (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   TEXT,
  phone      TEXT
);

CREATE TABLE partner_contracts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id         INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  start_date         TEXT NOT NULL,
  end_date           TEXT NOT NULL,
  expected_amount    REAL NOT NULL,
  payment_frequency  TEXT NOT NULL CHECK(payment_frequency IN ('monthly','quarterly','annual','one-time')),
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id     INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id    INTEGER NOT NULL REFERENCES partner_contracts(id),
  amount         REAL NOT NULL,
  paid_date      TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','cheque')),
  receipt_no     TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_payment_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id  INTEGER NOT NULL REFERENCES partner_payments(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id  INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK(doc_type IN ('contract','agreement','other')),
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Payment status is computed at query time — no stored status column on partner_payments. Status logic per contract:
- **paid**: SUM(payments.amount) >= contract.expected_amount
- **partial**: 0 < SUM(payments.amount) < contract.expected_amount
- **overdue**: date(contract.end_date) < date('now') AND SUM(payments.amount) < contract.expected_amount
- **pending**: no payments yet and contract not yet past end_date

---

## Backend API

New file: `src/routes/partners.ts`. All routes require auth; write routes (POST/PUT/DELETE) require admin role.

```
GET    /api/partners                              list partners with computed status & totals
POST   /api/partners                              create partner
PUT    /api/partners/:id                          update partner
DELETE /api/partners/:id                          delete partner (cascades)

GET    /api/partners/:id/contacts                 list contacts
POST   /api/partners/:id/contacts                 add contact
PUT    /api/partners/:id/contacts/:cid            update contact
DELETE /api/partners/:id/contacts/:cid            delete contact

GET    /api/partners/:id/contracts                list contracts
POST   /api/partners/:id/contracts                add contract
PUT    /api/partners/:id/contracts/:cid           update contract
DELETE /api/partners/:id/contracts/:cid           delete contract

GET    /api/partner-payments                      all payments (used by Payments tab); filterable by partner_id, from, to, status
POST   /api/partner-payments                      record payment (partner_id, contract_id, amount, paid_date, payment_method, receipt_no, notes)
DELETE /api/partner-payments/:id                  delete payment

POST   /api/partner-payments/:id/attachments      upload cheque copy to R2
DELETE /api/partner-payments/:id/attachments/:aid delete cheque copy

GET    /api/partners/:id/documents                list documents
POST   /api/partners/:id/documents                upload document to R2
DELETE /api/partners/:id/documents/:did           delete document

GET    /api/reports?type=partners&from=&to=       Partners report data
```

The Partners report endpoint returns:
- `summary`: total_expected, total_collected, total_outstanding
- `rows`: per-partner breakdown (company_name, expected, collected, balance, status)
- `payments`: full payment history for the period (for the detail/print view)

---

## Frontend Files

| File | Purpose |
|------|---------|
| `client/src/pages/Partners.tsx` | Page shell with two tabs |
| `client/src/components/partners/tabs/PartnersTab.tsx` | Card grid with sort/search/filter |
| `client/src/components/partners/tabs/PaymentsTab.tsx` | Flat payments list with stat cards |
| `client/src/components/partners/PartnerModal.tsx` | Detail modal (info, contacts, docs, contracts, payments) |
| `client/src/lib/hooks/usePartners.ts` | All React Query hooks and mutations |

**Changes to existing files:**
- `client/src/App.tsx`: add `/partners` route (admin-protected, same as Reports)
- `client/src/components/layout/TopNav.tsx`: add "Partners" link to BASE_NAV
- `client/src/pages/Reports.tsx`: add "Partners" tab to TABS array and wire up `PartnersReportView`
- `client/src/components/reports/PartnersReportView.tsx`: new report view component
- `src/index.ts`: mount `/api/partner-payments` and update `/api/partners` routes
- `migrations/0007-partners.sql`: new migration file

---

## Access Control

- All authenticated users can view the Partners page and payments.
- Only `admin` and `superadmin` roles can create, edit, or delete partners, contacts, contracts, payments, or documents.
- Partners report is admin-only (same as existing reports).

---

## Error Handling

- Deleting a partner cascades to contacts, contracts, payments, and documents (DB-level CASCADE).
- File uploads follow the same R2 pattern as bill attachments and rental documents.
- Payment status is always computed server-side, never stored, to avoid stale data.
