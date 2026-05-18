# Admin Governance: Role System, Activity Logs & Archive

**Date:** 2026-05-18
**Status:** Approved

---

## Overview

Three interconnected features that form the administrative governance layer of the property management app:

1. **Role System** — three-tier access control (superadmin / admin / staff)
2. **Activity Logs** — audit trail visible to superadmin only, with inline attribution on records
3. **Archive & History** — soft-archive for ended-contract tenants with 1-year data retention

---

## 1. Role System

### Roles

| Role | Description |
|---|---|
| `superadmin` | Full access including activity logs and user account management |
| `admin` | Full operational access — no logs, no user management |
| `staff` | Create-only on tenants/contracts/bills, mark paid, upload documents |

### Permission Matrix

| Capability | Superadmin | Admin | Staff |
|---|---|---|---|
| View dashboard, tenants, units, buildings | ✅ | ✅ | ✅ |
| View contracts, payments, bills, PDC | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ |
| Mark payments / bills as paid | ✅ | ✅ | ✅ |
| Upload documents | ✅ | ✅ | ✅ |
| Create tenants | ✅ | ✅ | ✅ |
| Edit / delete tenants | ✅ | ✅ | ❌ |
| Create contracts | ✅ | ✅ | ✅ |
| Edit / delete contracts | ✅ | ✅ | ❌ |
| Create bills | ✅ | ✅ | ✅ |
| Edit / delete bills | ✅ | ✅ | ❌ |
| Create / edit / delete buildings / units | ✅ | ✅ | ❌ |
| Access settings | ✅ | ✅ | ❌ |
| Archive tenants (confirm prompt) | ✅ | ✅ | ❌ |
| View activity logs | ✅ | ❌ | ❌ |
| Manage user accounts | ✅ | ❌ | ❌ |

### Implementation

- `users.role` column updated from `'admin' | 'staff'` to `'superadmin' | 'admin' | 'staff'`
- `requireAdmin` middleware replaced with `requireRole(...roles)` — each route declares the minimum role(s) allowed
- Frontend hides UI elements (edit/delete buttons, settings nav, logs nav) based on the JWT role claim

---

## 2. Activity Logs

### Schema

```sql
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`action` values:**
- `payment.marked_paid`, `payment.marked_unpaid`
- `bill.created`, `bill.edited`, `bill.deleted`, `bill.marked_paid`
- `contract.created`, `contract.edited`, `contract.deleted`
- `tenant.created`, `tenant.edited`, `tenant.archived`, `tenant.restored`, `tenant.deleted`
- `pdc.status_changed`
- `user.created`, `user.edited`

**`entity_type` values:** `payment` | `bill` | `contract` | `tenant` | `pdc` | `user`

**`note`:** Human-readable summary of what changed, e.g. `"Changed annual_rent from 50,000 to 55,000 AED"`

### Dedicated Audit Log Page (superadmin only)

- Route: `/logs` in top nav, visible to superadmin only
- Displays newest-first, paginated (50 per page)
- Filters: **user**, **action type**, **date range**
- Columns: Date/time · User · Action · Entity · Note

### Inline Attribution (superadmin only)

- Shown below each record row (payment, bill, contract, tenant)
- Format: *"Last edited by Mitch · May 18, 2:30 PM"*
- Query: `SELECT user_name, created_at FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1`
- Rendered only when the authenticated user is `superadmin`

---

## 3. Archive & History

### Schema Changes

```sql
ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
-- values: 'active' | 'archived'

ALTER TABLE tenants ADD COLUMN archived_at TEXT;
-- datetime of when the tenant was archived
```

### Archive Flow

1. **Cron job runs daily** — queries tenants where the most recent contract `end_date < today` AND `tenant.status = 'active'`
2. **App surfaces a confirmation banner** for admin/superadmin: *"Contract for [Name] has ended. Archive this tenant?"*
3. On confirm:
   - `tenants.status` → `'archived'`, `tenants.archived_at` → now
   - `tenants.unit_id` → `NULL` (unit freed, marked vacant)
   - Log entry written: `tenant.archived`
4. On dismiss: banner is dismissed; tenant stays active until confirmed

### Archived Section

- New **"Archived"** tab in the Rentals page (alongside Buildings, Units, Tenants)
- Lists all tenants where `status = 'archived'`
- Clicking a former tenant opens their full detail view:
  - Profile (permanent): name, phone, email, Emirates ID, notes
  - Contracts (permanent): full list
  - Payments, Bills, PDC cheques: visible until 1 year after `archived_at`, then purged
  - Documents/attachments: visible until 1 year after `archived_at`, then purged from R2

### Restore

- Admin/superadmin can click **"Restore"** on an archived tenant
- Sets `status = 'active'`, clears `archived_at`
- Unit reassignment done manually after restore
- Logged as `tenant.restored`

### 1-Year Data Retention (cron job — runs daily)

| Data | Action when `archived_at + 1 year` passed |
|---|---|
| `rent_payments` rows | DELETE WHERE tenant_id |
| `bills` rows | DELETE WHERE tenant_id (cascades to bill_entries) |
| `pdc_cheques` rows | DELETE WHERE contract_id (for that tenant) |
| R2 attachments | Delete objects from R2 bucket |
| `rental_documents` rows | DELETE WHERE entity_id (tenant) |
| `tenants` profile + `contracts` | Never deleted |

---

## Data Flow Summary

```
Contract expires
  → Daily cron detects it
  → Confirmation banner shown to admin/superadmin
  → Admin confirms
  → tenant.status = 'archived', unit freed, audit_logs entry written
  → Archived tab shows tenant with full history
  → 1 year later: cron purges payments, bills, PDC, attachments
  → Only profile + contracts remain
```

---

## Out of Scope

- Bulk archive actions
- Email notifications on contract expiry (can be added later)
- Per-field diff tracking in audit logs (can be added later)
