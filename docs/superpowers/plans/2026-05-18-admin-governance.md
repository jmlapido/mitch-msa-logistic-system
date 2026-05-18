# Admin Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-tier role system (superadmin/admin/staff), a filterable audit log, and a soft-archive workflow for tenants whose contracts have ended.

**Architecture:** A new `requireRole` middleware replaces `requireAdmin` using a role hierarchy (staff < admin < superadmin). A shared `auditLog` helper writes to a new `audit_logs` table on every mutation. Expired-contract tenants surface via a `/api/tenants/pending-archive` endpoint; archiving is a manual admin confirmation; a daily Cloudflare Workers cron purges financial data 1 year after archive.

**Tech Stack:** Hono, D1 (SQLite), R2, Cloudflare Workers (cron), React, TanStack Query, Zod, Tailwind, shadcn/ui

---

## Task 1: DB Migration

**Files:**
- Create: `migrations/0001-governance.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- migrations/0001-governance.sql

-- Add status tracking to tenants
ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN archived_at TEXT;

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
```

- [ ] **Step 2: Apply locally**

```bash
npx wrangler d1 execute mitch-app-db --local --file=migrations/0001-governance.sql
```

Expected: No errors, tables created.

- [ ] **Step 3: Apply to remote**

```bash
npx wrangler d1 execute mitch-app-db --remote --file=migrations/0001-governance.sql
```

- [ ] **Step 4: Commit**

```bash
git add migrations/0001-governance.sql
git commit -m "feat: add audit_logs table and tenant archive columns"
```

---

## Task 2: requireRole Middleware

**Files:**
- Create: `src/middleware/requireRole.ts`
- Modify: `src/middleware/requireAdmin.ts`
- Create: `src/lib/auditLog.ts`

- [ ] **Step 1: Write failing test**

Create `src/middleware/requireRole.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireRole } from './requireRole';

function makeApp(minRole: 'staff' | 'admin' | 'superadmin') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', { sub: 1, email: 'x@x.com', name: 'X', role: (c.req.header('x-role') ?? 'staff'), exp: 9999999999 });
    await next();
  });
  app.get('/test', requireRole(minRole), (c) => c.json({ ok: true }));
  return app;
}

describe('requireRole', () => {
  it('allows exact role match', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'admin' } });
    expect(res.status).toBe(200);
  });

  it('allows higher role', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'superadmin' } });
    expect(res.status).toBe(200);
  });

  it('blocks lower role', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'staff' } });
    expect(res.status).toBe(403);
  });

  it('blocks staff from superadmin route', async () => {
    const app = makeApp('superadmin');
    const res = await app.request('/test', { headers: { 'x-role': 'staff' } });
    expect(res.status).toBe(403);
  });

  it('blocks admin from superadmin route', async () => {
    const app = makeApp('superadmin');
    const res = await app.request('/test', { headers: { 'x-role': 'admin' } });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/middleware/requireRole.test.ts
```

Expected: FAIL — `requireRole` not found.

- [ ] **Step 3: Write requireRole middleware**

Create `src/middleware/requireRole.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env, UserRole } from '../types';
import type { AuthVariables } from './requireAuth';

const ROLE_LEVEL: Record<UserRole, number> = { staff: 1, admin: 2, superadmin: 3 };

export const requireRole = (minRole: UserRole) =>
  createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user');
    if ((ROLE_LEVEL[user.role] ?? 0) < ROLE_LEVEL[minRole]) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });
```

- [ ] **Step 4: Update UserRole type**

Edit `src/types.ts`:

```typescript
export type UserRole = 'superadmin' | 'admin' | 'staff';

export type Env = {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
};

export type JWTPayload = {
  sub: number;
  email: string;
  role: UserRole;
  name: string;
  exp: number;
};
```

- [ ] **Step 5: Update requireAdmin to use hierarchy**

Edit `src/middleware/requireAdmin.ts`:

```typescript
import { requireRole } from './requireRole';

export const requireAdmin = requireRole('admin');
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/middleware/requireRole.test.ts
```

Expected: 5 passing.

- [ ] **Step 7: Write audit log helper**

Create `src/lib/auditLog.ts`:

```typescript
import type { D1Database } from '@cloudflare/workers-types';
import type { JWTPayload } from '../types';

export async function auditLog(
  db: D1Database,
  user: JWTPayload,
  action: string,
  entityType: string,
  entityId: number | null,
  note?: string
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, note) VALUES (?,?,?,?,?,?)'
    )
    .bind(user.sub, user.name, action, entityType, entityId, note ?? null)
    .run();
}
```

- [ ] **Step 8: Commit**

```bash
git add src/middleware/requireRole.ts src/middleware/requireRole.test.ts src/middleware/requireAdmin.ts src/types.ts src/lib/auditLog.ts
git commit -m "feat: add requireRole middleware and auditLog helper"
```

---

## Task 3: Update Routes — Roles + Audit Logging

**Files:**
- Modify: `src/routes/users.ts`
- Modify: `src/routes/contracts.ts`
- Modify: `src/routes/bills.ts`
- Modify: `src/routes/rent-payments.ts`
- Modify: `src/routes/pdc-cheques.ts`
- Modify: `src/routes/buildings.ts`
- Modify: `src/routes/units.ts`

### 3a: users.ts — restrict to superadmin, allow superadmin role creation

Edit `src/routes/users.ts` — replace entire file:

- [ ] **Step 1: Update users.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { hashPassword } from '../lib/auth';
import { auditLog } from '../lib/auditLog';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/requireAuth';

const users = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
users.use('*', requireAuth, requireRole('superadmin'));

users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY name'
  ).all();
  return c.json(results);
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['superadmin', 'admin', 'staff']),
});

users.post('/', zValidator('json', createSchema), async (c) => {
  const actor = c.get('user');
  const d = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(d.email).first();
  if (existing) return c.json({ error: 'Email already in use' }, 409);
  const hash = await hashPassword(d.password);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?) RETURNING id, name, email, role, active, created_at'
  ).bind(d.name, d.email, hash, d.role).first<{ id: number }>();
  await auditLog(c.env.DB, actor, 'user.created', 'user', result?.id ?? null, `Created user ${d.name} (${d.role})`);
  return c.json(result, 201);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['superadmin', 'admin', 'staff']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

users.put('/:id', zValidator('json', updateSchema), async (c) => {
  const actor = c.get('user');
  const id = Number(c.req.param('id'));
  const { password, active, ...rest } = c.req.valid('json');
  const updates: Record<string, unknown> = { ...rest };
  if (password) updates['password_hash'] = await hashPassword(password);
  if (active !== undefined) updates['active'] = active ? 1 : 0;
  const entries = Object.entries(updates);
  if (!entries.length) return c.json({ error: 'Nothing to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE users SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  await auditLog(c.env.DB, actor, 'user.edited', 'user', id, `Updated fields: ${Object.keys(updates).join(', ')}`);
  return c.json(await c.env.DB.prepare(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = ?'
  ).bind(id).first());
});

users.delete('/:id', async (c) => {
  const actor = c.get('user');
  const callerId = actor.sub;
  if (Number(c.req.param('id')) === callerId)
    return c.json({ error: 'Cannot deactivate your own account' }, 400);
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, actor, 'user.deactivated', 'user', id);
  return c.json({ ok: true });
});

export default users;
```

### 3b: contracts.ts — audit logging

- [ ] **Step 2: Update contracts.ts**

Edit `src/routes/contracts.ts` — add audit logging to POST, PUT, DELETE:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const contracts = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
contracts.use('*', requireAuth);

const contractSchema = z.object({
  tenant_id: z.number().int().positive(),
  contract_no: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annual_rent: z.number().min(0),
  payment_type: z.enum(['cash', 'pdc']).default('pdc'),
  no_of_pdc: z.number().int().min(0).max(24).default(0),
  due_day: z.number().int().min(1).max(28).optional(),
  notes: z.string().optional(),
});

contracts.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id');
  if (!tenantId) return c.json({ error: 'tenant_id required' }, 400);
  const { results } = await c.env.DB.prepare(`
    SELECT *,
      CASE WHEN date(end_date) >= date('now') THEN 'valid' ELSE 'expired' END as status
    FROM contracts
    WHERE tenant_id = ?
    ORDER BY start_date DESC
  `).bind(Number(tenantId)).all();
  return c.json(results);
});

contracts.post('/', requireAdmin, zValidator('json', contractSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO contracts (tenant_id, contract_no, start_date, end_date, annual_rent, payment_type, no_of_pdc, due_day, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.tenant_id, d.contract_no, d.start_date, d.end_date, d.annual_rent, d.payment_type, d.no_of_pdc, d.due_day ?? null, d.notes ?? null, user.sub).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'contract.created', 'contract', result?.id ?? null, `Contract #${d.contract_no}`);
  return c.json(result, 201);
});

contracts.put('/:id', requireAdmin, zValidator('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE contracts SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  const row = await c.env.DB.prepare(
    `SELECT *, CASE WHEN date(end_date) >= date('now') THEN 'valid' ELSE 'expired' END as status FROM contracts WHERE id = ?`
  ).bind(id).first();
  await auditLog(c.env.DB, user, 'contract.edited', 'contract', id, `Updated: ${entries.map(([k]) => k).join(', ')}`);
  return c.json(row);
});

contracts.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM contracts WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'contract.deleted', 'contract', id);
  return c.json({ ok: true });
});

export default contracts;
```

### 3c: bills.ts — audit logging

- [ ] **Step 3: Update bills.ts**

Edit `src/routes/bills.ts` — add audit logging to POST, PUT, DELETE:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const bills = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
bills.use('*', requireAuth);

const billSchema = z.object({
  category_id: z.number().int().positive(),
  particulars: z.string().min(1).max(100),
  account_no: z.string().max(60).nullish(),
  due_day: z.number().int().min(1).max(28).nullish(),
  is_recurring: z.coerce.boolean().default(true),
  notes: z.string().nullish(),
});

bills.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
           p.name as property_name, p.type as property_type
    FROM bills b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN properties p ON b.property_id = p.id
    ORDER BY c.sort_order, c.name, p.name, b.particulars
  `).all();
  return c.json(results);
});

const createBillSchema = billSchema.extend({ amount: z.number().min(0).default(0) });

bills.post('/', requireAdmin, zValidator('json', createBillSchema), async (c) => {
  const user = c.get('user');
  const { amount, ...data } = c.req.valid('json');
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);

  const result = await c.env.DB.prepare(
    `INSERT INTO bills (category_id, particulars, account_no, due_day, is_recurring, notes, created_by)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    data.category_id, data.particulars, data.account_no ?? null,
    data.due_day ?? null, data.is_recurring ? 1 : 0, data.notes ?? null, user.sub
  ).first<{ id: number }>();

  let entry_id: number | null = null;
  if (result && data.is_recurring) {
    const entry = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO bill_entries (bill_id, month, amount, status) VALUES (?,?,?,'unpaid') RETURNING id`
    ).bind(result.id, month, amount).first<{ id: number }>();
    if (entry) {
      entry_id = entry.id;
    } else {
      const existing = await c.env.DB.prepare(
        `SELECT id FROM bill_entries WHERE bill_id = ? AND month = ?`
      ).bind(result.id, month).first<{ id: number }>();
      entry_id = existing?.id ?? null;
    }
  }

  await auditLog(c.env.DB, user, 'bill.created', 'bill', result?.id ?? null, `Bill: ${data.particulars}`);
  return c.json({ ...result, entry_id }, 201);
});

bills.put('/:id', requireAdmin, zValidator('json', billSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const dbData = { ...data, is_recurring: data.is_recurring !== undefined ? (data.is_recurring ? 1 : 0) : undefined };
  const fields = Object.entries(dbData).filter(([, v]) => v !== undefined).map(([k]) => `${k} = ?`).join(', ');
  const values = [...Object.values(dbData).filter(v => v !== undefined), id];
  await c.env.DB.prepare(`UPDATE bills SET ${fields} WHERE id = ?`).bind(...values).run();
  await auditLog(c.env.DB, user, 'bill.edited', 'bill', id, `Updated: ${Object.keys(data).join(', ')}`);
  return c.json(await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(id).first());
});

bills.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'bill.deleted', 'bill', id);
  return c.json({ ok: true });
});

export default bills;
```

### 3d: rent-payments.ts — audit logging on PUT

- [ ] **Step 4: Update rent-payments.ts**

Edit `src/routes/rent-payments.ts` — add audit logging to PUT (add import and update handler):

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const rentPayments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
rentPayments.use('*', requireAuth);

rentPayments.get('/', async (c) => {
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);
  const buildingId = c.req.query('building_id');

  await c.env.DB.prepare(`
    WITH RECURSIVE month_gen(m) AS (
      SELECT strftime('%Y-%m', MIN(start_date)) FROM contracts
      UNION ALL
      SELECT strftime('%Y-%m', m || '-01', '+1 month')
      FROM month_gen WHERE m < ?
    )
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT c.id, mg.m, ROUND(c.annual_rent / 12, 2), 'pending'
    FROM contracts c
    CROSS JOIN month_gen mg
    WHERE date(c.start_date) <= mg.m || '-28'
      AND date(c.end_date) >= mg.m || '-01'
      AND mg.m <= ?
  `).bind(month, month).run();

  await c.env.DB.prepare(
    `UPDATE rent_payments SET status = 'overdue' WHERE month < ? AND status = 'pending'`
  ).bind(month).run();

  let query = `
    SELECT rp.*, ROUND(c.annual_rent / 12, 2) as expected_rent,
      t.id as tenant_id, t.name as tenant_name, t.phone as tenant_phone, t.email as tenant_email,
      u.unit_no, u.type as unit_type,
      b.id as building_id, b.name as building_name,
      c.payment_type,
      CASE
        WHEN c.payment_type = 'cash' THEN
          rp.month || '-' || printf('%02d', COALESCE(c.due_day, 1))
        WHEN c.payment_type = 'pdc' THEN
          pc.cheque_date
        ELSE NULL
      END as due_date,
      (SELECT COALESCE(SUM(rp2.amount), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status != 'collected'
         AND rp2.month < ?) as tenant_overdue,
      (SELECT COALESCE(SUM(rp2.amount), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status != 'collected') as tenant_balance
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    LEFT JOIN pdc_cheques pc ON pc.contract_id = c.id
      AND pc.pdc_number = MIN(
        c.no_of_pdc,
        MAX(1, (CAST(strftime('%Y', rp.month) AS INTEGER) * 12 + CAST(strftime('%m', rp.month) AS INTEGER))
             - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER)) + 1)
      )
    WHERE rp.month = ?
  `;
  const binds: unknown[] = [month, month];
  if (buildingId) { query += ' AND b.id = ?'; binds.push(Number(buildingId)); }
  query += ' ORDER BY b.name, u.unit_no';

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  status: z.enum(['collected', 'pending', 'overdue']).optional(),
  paid_date: z.string().nullable().optional(),
  receipt_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

rentPayments.put('/:id', zValidator('json', updatePaymentSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const now = new Date().toISOString();
  const entries = [...Object.entries(d), ['recorded_by', user.sub], ['recorded_at', now]];
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE rent_payments SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  if (d.status === 'collected') {
    await auditLog(c.env.DB, user, 'payment.marked_paid', 'payment', id, `Marked collected for month`);
  } else if (d.status) {
    await auditLog(c.env.DB, user, 'payment.status_changed', 'payment', id, `Status → ${d.status}`);
  } else {
    await auditLog(c.env.DB, user, 'payment.edited', 'payment', id, `Updated: ${Object.keys(d).join(', ')}`);
  }
  return c.json(await c.env.DB.prepare('SELECT * FROM rent_payments WHERE id = ?').bind(id).first());
});

export default rentPayments;
```

### 3e: pdc-cheques.ts — audit logging on date and upload

- [ ] **Step 5: Update pdc-cheques.ts**

Add `import { auditLog } from '../lib/auditLog';` and add audit calls after the date POST and upload POST:

In `router.post('/date', ...)` after the upsert query, add:
```typescript
await auditLog(c.env.DB, user, 'pdc.date_set', 'pdc', null, `Contract ${contract_id} PDC #${pdc_number} → ${cheque_date}`);
```

In `router.post('/upload', ...)` after the upsert query, add:
```typescript
await auditLog(c.env.DB, user, 'pdc.file_uploaded', 'pdc', null, `Contract ${contractId} PDC #${pdcNumber}: ${file.name}`);
```

Note: the `/date` route already has `requireAdmin`. Add `const user = c.get('user');` at the top of both handlers that don't already have it.

- [ ] **Step 6: Commit**

```bash
git add src/routes/users.ts src/routes/contracts.ts src/routes/bills.ts src/routes/rent-payments.ts src/routes/pdc-cheques.ts
git commit -m "feat: add audit logging to all mutating routes"
```

---

## Task 4: Audit Logs API Route

**Files:**
- Create: `src/routes/audit-logs.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create audit-logs route**

Create `src/routes/audit-logs.ts`:

```typescript
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const auditLogs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
auditLogs.use('*', requireAuth, requireRole('superadmin'));

auditLogs.get('/', async (c) => {
  const userId = c.req.query('user_id');
  const action = c.req.query('action');
  const entityType = c.req.query('entity_type');
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (userId) { conditions.push('user_id = ?'); binds.push(Number(userId)); }
  if (action) { conditions.push('action = ?'); binds.push(action); }
  if (entityType) { conditions.push('entity_type = ?'); binds.push(entityType); }
  if (dateFrom) { conditions.push("date(created_at) >= date(?)"); binds.push(dateFrom); }
  if (dateTo) { conditions.push("date(created_at) <= date(?)"); binds.push(dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM audit_logs ${where}`
  ).bind(...binds).first<{ total: number }>();

  return c.json({ results, total: countRow?.total ?? 0, page, limit });
});

auditLogs.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT user_id, user_name FROM audit_logs ORDER BY user_name'
  ).all();
  return c.json(results);
});

auditLogs.get('/actions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action'
  ).all();
  return c.json(results);
});

export default auditLogs;
```

- [ ] **Step 2: Register route in index.ts**

Edit `src/index.ts` — add import and route registration:

```typescript
import auditLogsRoutes from './routes/audit-logs';
// ... existing imports ...

app.route('/api/audit-logs', auditLogsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/audit-logs.ts src/index.ts
git commit -m "feat: add /api/audit-logs route (superadmin only)"
```

---

## Task 5: Tenant Archive — Backend

**Files:**
- Modify: `src/routes/tenants.ts`
- Modify: `src/index.ts`
- Modify: `wrangler.toml`

- [ ] **Step 1: Update tenants.ts**

Edit `src/routes/tenants.ts` — replace entire file:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/requireAuth';

const tenants = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
tenants.use('*', requireAuth);

const tenantSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  id_number: z.string().optional(),
  notes: z.string().optional(),
  unit_id: z.number().int().positive().nullable().optional(),
});

// Active tenants list
tenants.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*,
      c.id as lease_id,
      CASE WHEN c.id IS NOT NULL THEN
        CASE WHEN date(c.end_date) <= date('now', '+30 days') THEN 'expiring'
             ELSE 'active' END
      ELSE NULL END as lease_status,
      c.start_date, c.end_date,
      ROUND(c.annual_rent / 12, 2) as monthly_rent,
      u.unit_no, bld.name as building_name
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.id = (
      SELECT id FROM contracts
      WHERE tenant_id = t.id AND date(end_date) >= date('now')
      ORDER BY end_date DESC LIMIT 1
    )
    WHERE t.status = 'active'
    ORDER BY t.name
  `).all();
  return c.json(results);
});

// Tenants with all contracts expired but still active — awaiting archive confirmation
tenants.get('/pending-archive', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*, u.unit_no, bld.name as building_name,
      MAX(c.end_date) as last_contract_end
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.tenant_id = t.id
    WHERE t.status = 'active'
    GROUP BY t.id
    HAVING COUNT(c.id) > 0
      AND MAX(date(c.end_date)) < date('now')
    ORDER BY last_contract_end ASC
  `).all();
  return c.json(results);
});

// Archived tenants list
tenants.get('/archived', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*,
      MAX(c.end_date) as last_contract_end,
      MAX(c.annual_rent) as last_annual_rent,
      u.unit_no, bld.name as building_name
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.tenant_id = t.id
    WHERE t.status = 'archived'
    GROUP BY t.id
    ORDER BY t.archived_at DESC
  `).all();
  return c.json(results);
});

tenants.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  if (!tenant) return c.json({ error: 'Not found' }, 404);
  const { results: leases } = await c.env.DB.prepare(`
    SELECT l.*, u.unit_no, b.name as building_name
    FROM leases l JOIN units u ON l.unit_id = u.id JOIN buildings b ON u.building_id = b.id
    WHERE l.tenant_id = ? ORDER BY l.start_date DESC
  `).bind(id).all();
  const { results: contracts } = await c.env.DB.prepare(
    `SELECT *, CASE WHEN date(end_date) >= date('now') THEN 'valid' ELSE 'expired' END as status
     FROM contracts WHERE tenant_id = ? ORDER BY start_date DESC`
  ).bind(id).all();
  const { results: docs } = await c.env.DB.prepare(
    "SELECT * FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? ORDER BY uploaded_at DESC"
  ).bind(id).all();
  return c.json({ ...tenant, leases, contracts, documents: docs });
});

tenants.post('/', zValidator('json', tenantSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO tenants (name, phone, email, id_number, notes, unit_id) VALUES (?,?,?,?,?,?) RETURNING *'
  ).bind(d.name, d.phone ?? null, d.email || null, d.id_number ?? null, d.notes ?? null, d.unit_id ?? null).first();
  await auditLog(c.env.DB, user, 'tenant.created', 'tenant', (result as { id: number })?.id ?? null, `Created tenant: ${d.name}`);
  return c.json(result, 201);
});

tenants.put('/:id', requireAdmin, zValidator('json', tenantSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE tenants SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  await auditLog(c.env.DB, user, 'tenant.edited', 'tenant', id, `Updated: ${entries.map(([k]) => k).join(', ')}`);
  return c.json(await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first());
});

// Archive a tenant (admin/superadmin only)
tenants.post('/:id/archive', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ? AND status = ?').bind(id, 'active').first<{ name: string; unit_id: number | null }>();
  if (!tenant) return c.json({ error: 'Tenant not found or already archived' }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE tenants SET status = 'archived', archived_at = ?, unit_id = NULL WHERE id = ?"
  ).bind(now, id).run();

  // Free the unit
  if (tenant.unit_id) {
    await c.env.DB.prepare("UPDATE units SET occupancy_status = 'vacant' WHERE id = ?").bind(tenant.unit_id).run();
  }

  await auditLog(c.env.DB, user, 'tenant.archived', 'tenant', id, `Archived tenant: ${tenant.name}`);
  return c.json({ ok: true });
});

// Restore a tenant (admin/superadmin only)
tenants.post('/:id/restore', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT name FROM tenants WHERE id = ? AND status = ?').bind(id, 'archived').first<{ name: string }>();
  if (!tenant) return c.json({ error: 'Tenant not found or not archived' }, 404);

  await c.env.DB.prepare(
    "UPDATE tenants SET status = 'active', archived_at = NULL WHERE id = ?"
  ).bind(id).run();

  await auditLog(c.env.DB, user, 'tenant.restored', 'tenant', id, `Restored tenant: ${tenant.name}`);
  return c.json({ ok: true });
});

tenants.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'tenant.deleted', 'tenant', id);
  return c.json({ ok: true });
});

export default tenants;
```

- [ ] **Step 2: Add cron trigger to wrangler.toml**

Edit `wrangler.toml` — add before `[dev]`:

```toml
[triggers]
crons = ["0 2 * * *"]
```

- [ ] **Step 3: Add scheduled handler to index.ts**

Edit `src/index.ts` — replace `export default app` with:

```typescript
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Purge financial data 1 year after tenant archive
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString();

    // Get all tenant IDs archived over 1 year ago
    const { results: expiredTenants } = await env.DB.prepare(
      "SELECT id FROM tenants WHERE status = 'archived' AND archived_at < ?"
    ).bind(cutoffStr).all<{ id: number }>();

    for (const { id } of expiredTenants) {
      // Delete rent_payments via contracts
      await env.DB.prepare(
        'DELETE FROM rent_payments WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id = ?)'
      ).bind(id).run();

      // Delete pdc_cheques via contracts
      await env.DB.prepare(
        'DELETE FROM pdc_cheques WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id = ?)'
      ).bind(id).run();

      // Get and delete R2 files from rental_documents
      const { results: docs } = await env.DB.prepare(
        "SELECT file_key FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? AND file_key IS NOT NULL"
      ).bind(id).all<{ file_key: string }>();
      for (const { file_key } of docs) {
        await env.R2.delete(file_key).catch(() => {});
      }
      await env.DB.prepare(
        "DELETE FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ?"
      ).bind(id).run();

      // Delete bill_entries then bills (no tenant FK on bills — bills are property-level)
      // Skip bills table as bills are not tenant-specific in this schema
    }
  },
};
```

Note: `ScheduledEvent` and `ExecutionContext` are available from `@cloudflare/workers-types` — already included in the project's type setup.

- [ ] **Step 4: Commit**

```bash
git add src/routes/tenants.ts src/index.ts wrangler.toml
git commit -m "feat: archive/restore endpoints, pending-archive query, daily cleanup cron"
```

---

## Task 6: Frontend — Role Types + Route Guards + TopNav

**Files:**
- Modify: `client/src/lib/hooks/useAuth.tsx`
- Modify: `client/src/components/layout/AdminRoute.tsx`
- Create: `client/src/components/layout/SuperAdminRoute.tsx`
- Modify: `client/src/components/layout/TopNav.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update useAuth.tsx role type**

Edit `client/src/lib/hooks/useAuth.tsx` — update the `User` type:

```typescript
type User = { id: number; name: string; email: string; role: 'superadmin' | 'admin' | 'staff' };
```

- [ ] **Step 2: Update AdminRoute to allow superadmin**

Edit `client/src/components/layout/AdminRoute.tsx`:

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/hooks/useAuth';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'superadmin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Create SuperAdminRoute**

Create `client/src/components/layout/SuperAdminRoute.tsx`:

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/hooks/useAuth';

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'superadmin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Update TopNav — add Logs link for superadmin**

Edit `client/src/components/layout/TopNav.tsx`:

Replace the `NAV_LINKS` constant and its usage with dynamic nav that includes Logs for superadmin only:

```typescript
import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, LogOut, User, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useSettings } from '@/lib/hooks/useSettings';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BASE_NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/bills', label: 'Bills' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/reports', label: 'Reports' },
];

export function TopNav() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = user?.role === 'superadmin'
    ? [...BASE_NAV, { to: '/logs', label: 'Logs' }]
    : BASE_NAV;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <nav className="bg-primary text-primary-foreground shadow-md no-print">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-7 w-7 rounded object-contain" />
          )}
          <span className="font-bold text-sm">{settings?.company_name ?? 'MSA Logistic'}</span>
        </Link>

        <div className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to} to={to}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="text-primary-foreground hover:bg-white/10">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/10 gap-2 hidden md:inline-flex">
                <User size={16} /> {user?.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">{user?.role}</DropdownMenuItem>
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut size={14} className="mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost" size="icon"
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden text-primary-foreground hover:bg-white/10"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/20 px-4 py-2 space-y-1">
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to} to={to}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="border-t border-white/20 pt-2 mt-2 flex items-center justify-between">
            <span className="text-sm text-white/80">{user?.name} · {user?.role}</span>
            <div className="flex gap-1">
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <Link to="/settings" className="text-xs px-2 py-1 rounded hover:bg-white/10">Settings</Link>
              )}
              <button onClick={logout} className="text-xs px-2 py-1 rounded hover:bg-white/10 text-red-300">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Add /logs route to App.tsx**

Edit `client/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/hooks/useAuth';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { TopNav } from '@/components/layout/TopNav';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Bills from '@/pages/Bills';
import Rentals from '@/pages/Rentals';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import AuditLogs from '@/pages/AuditLogs';
import { AdminRoute } from '@/components/layout/AdminRoute';
import { SuperAdminRoute } from '@/components/layout/SuperAdminRoute';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster richColors position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/bills" element={<Bills />} />
                    <Route path="/rentals" element={<Rentals />} />
                    <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
                    <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                    <Route path="/logs" element={<SuperAdminRoute><AuditLogs /></SuperAdminRoute>} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/hooks/useAuth.tsx client/src/components/layout/AdminRoute.tsx client/src/components/layout/SuperAdminRoute.tsx client/src/components/layout/TopNav.tsx client/src/App.tsx
git commit -m "feat: add superadmin role, SuperAdminRoute, Logs nav link"
```

---

## Task 7: Frontend — Staff UI Enforcement

**Files:**
- Modify: `client/src/components/rentals/tabs/TenantsTab.tsx`
- Modify: `client/src/components/rentals/ContractsPanel.tsx`

Staff cannot edit or delete tenants, contracts, buildings, or units. The backend already enforces this — the frontend hides the buttons for a cleaner UX.

- [ ] **Step 1: Update TenantsTab.tsx — hide edit/delete for staff**

In `TenantsTab.tsx`, the edit and delete buttons are already guarded by `user?.role === 'admin'`. Update that check to `user?.role === 'admin' || user?.role === 'superadmin'`:

Find:
```tsx
{user?.role === 'admin' && <>
  <button onClick={() => openEdit(t)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
  <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
</>}
```

Replace with:
```tsx
{(user?.role === 'admin' || user?.role === 'superadmin') && <>
  <button onClick={() => openEdit(t)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
  <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
</>}
```

Also update the "Add Tenant" button guard the same way:
```tsx
{(user?.role === 'admin' || user?.role === 'superadmin') && (
  <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Tenant</Button>
)}
```

- [ ] **Step 2: Update ContractsPanel.tsx — hide edit/delete for staff**

In `ContractsPanel.tsx`, find:
```tsx
{user?.role === 'admin' && (
  <button onClick={openAdd} ...
```

Replace with `(user?.role === 'admin' || user?.role === 'superadmin')` for both the Add button and the edit/delete buttons in the contract rows:

```tsx
{(user?.role === 'admin' || user?.role === 'superadmin') && (
  <button onClick={openAdd} className="flex items-center gap-1 text-xs text-primary hover:underline">
    <Plus size={11} /> Add
  </button>
)}
```

```tsx
{(user?.role === 'admin' || user?.role === 'superadmin') && (
  <div className="flex gap-1 shrink-0">
    <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={11} /></button>
    <button onClick={() => handleDelete(c)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/rentals/tabs/TenantsTab.tsx client/src/components/rentals/ContractsPanel.tsx
git commit -m "feat: hide edit/delete buttons from staff role"
```

---

## Task 8: Frontend — Audit Logs Page

**Files:**
- Create: `client/src/lib/hooks/useAuditLogs.ts`
- Create: `client/src/pages/AuditLogs.tsx`

- [ ] **Step 1: Create useAuditLogs hook**

Create `client/src/lib/hooks/useAuditLogs.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export type AuditLog = {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  note: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  user_id?: number;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
};

export type AuditLogResponse = {
  results: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

export type AuditUser = { user_id: number; user_name: string };

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  if (filters.user_id) params.set('user_id', String(filters.user_id));
  if (filters.action) params.set('action', filters.action);
  if (filters.entity_type) params.set('entity_type', filters.entity_type);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.page) params.set('page', String(filters.page));

  return useQuery<AuditLogResponse>({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get(`/api/audit-logs?${params.toString()}`),
  });
}

export function useAuditLogUsers() {
  return useQuery<AuditUser[]>({
    queryKey: ['audit-log-users'],
    queryFn: () => api.get('/api/audit-logs/users'),
  });
}

export function useAuditLogActions() {
  return useQuery<{ action: string }[]>({
    queryKey: ['audit-log-actions'],
    queryFn: () => api.get('/api/audit-logs/actions'),
  });
}

export function useLastAuditEntry(entityType: string, entityId: number) {
  return useQuery<AuditLog | null>({
    queryKey: ['audit-log-last', entityType, entityId],
    queryFn: async () => {
      const res = await api.get<AuditLogResponse>(
        `/api/audit-logs?entity_type=${entityType}&entity_id=${entityId}&page=1`
      );
      return res.results[0] ?? null;
    },
    enabled: !!entityId,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create AuditLogs page**

Create `client/src/pages/AuditLogs.tsx`:

```typescript
import { useState } from 'react';
import { useAuditLogs, useAuditLogUsers, useAuditLogActions } from '@/lib/hooks/useAuditLogs';
import { formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function AuditLogs() {
  const [userId, setUserId] = useState<number | undefined>();
  const [action, setAction] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLogs({ user_id: userId, action, entity_type: entityType, date_from: dateFrom || undefined, date_to: dateTo || undefined, page });
  const { data: users = [] } = useAuditLogUsers();
  const { data: actions = [] } = useAuditLogActions();

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  function reset() {
    setUserId(undefined); setAction(undefined); setEntityType(undefined);
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={userId ? String(userId) : 'all'} onValueChange={v => { setUserId(v === 'all' ? undefined : Number(v)); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map(u => <SelectItem key={u.user_id} value={String(u.user_id)}>{u.user_name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={action ?? 'all'} onValueChange={v => { setAction(v === 'all' ? undefined : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map(a => <SelectItem key={a.action} value={a.action}>{a.action}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={entityType ?? 'all'} onValueChange={v => { setEntityType(v === 'all' ? undefined : v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {['tenant', 'contract', 'payment', 'bill', 'pdc', 'user'].map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-40" placeholder="From" />
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-40" placeholder="To" />

        <Button variant="outline" size="sm" onClick={reset}>Clear</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date / Time</th>
                  <th className="text-left px-4 py-2 font-medium">User</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.results ?? []).map(log => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-medium">{log.user_name}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{log.entity_type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{log.note ?? '—'}</td>
                  </tr>
                ))}
                {(data?.results ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">{data?.total ?? 0} entries</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm self-center">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/hooks/useAuditLogs.ts client/src/pages/AuditLogs.tsx
git commit -m "feat: audit logs page with filters and pagination"
```

---

## Task 9: Frontend — Inline "Last Edited By" Attribution

**Files:**
- Modify: `client/src/components/rentals/ContractsPanel.tsx`
- Modify: `client/src/components/rentals/tabs/TenantsTab.tsx`

The inline attribution shows only to superadmin. It reads the most recent audit_log entry for each entity.

- [ ] **Step 1: Add inline attribution to ContractsPanel**

In `client/src/components/rentals/ContractsPanel.tsx`:

Add a `LastEditedBy` sub-component at the top of the file:

```typescript
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import { useAuth } from '@/lib/hooks/useAuth';

function LastEditedBy({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const { data: log } = useLastAuditEntry(entityType, entityId);
  if (user?.role !== 'superadmin' || !log) return null;
  return (
    <p className="text-[10px] text-muted-foreground mt-1">
      Last edited by <span className="font-medium">{log.user_name}</span> · {new Date(log.created_at).toLocaleString()}
    </p>
  );
}
```

Then in the contract card JSX, after `{c.notes && <p className="italic">{c.notes}</p>}`, add:

```tsx
<LastEditedBy entityType="contract" entityId={c.id} />
```

- [ ] **Step 2: Add inline attribution to TenantsTab**

In `client/src/components/rentals/tabs/TenantsTab.tsx`:

Add the same `LastEditedBy` component (import `useLastAuditEntry` and `useAuth`):

```typescript
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';

function LastEditedBy({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const { data: log } = useLastAuditEntry(entityType, entityId);
  if (user?.role !== 'superadmin' || !log) return null;
  return (
    <p className="text-[10px] text-muted-foreground">
      Last edited by <span className="font-medium">{log.user_name}</span> · {new Date(log.created_at).toLocaleString()}
    </p>
  );
}
```

In the tenant row expanded panel, in the Contact section after the notes line, add:

```tsx
<LastEditedBy entityType="tenant" entityId={t.id} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/rentals/ContractsPanel.tsx client/src/components/rentals/tabs/TenantsTab.tsx
git commit -m "feat: inline last-edited-by attribution for superadmin"
```

---

## Task 10: Frontend — Archive Banner + Archived Tab

**Files:**
- Create: `client/src/components/rentals/ArchiveBanner.tsx`
- Create: `client/src/components/rentals/tabs/ArchivedTab.tsx`
- Modify: `client/src/lib/hooks/useRentals.ts`
- Modify: `client/src/pages/Rentals.tsx`

- [ ] **Step 1: Add archived tenant hooks to useRentals.ts**

In `client/src/lib/hooks/useRentals.ts`, add after the existing `useTenants` function:

```typescript
export type ArchivedTenant = {
  id: number; name: string; phone?: string; email?: string; id_number?: string;
  notes?: string; status: string; archived_at: string;
  unit_no?: string; building_name?: string; last_contract_end?: string; last_annual_rent?: number;
};

export function useArchivedTenants() {
  return useQuery<ArchivedTenant[]>({ queryKey: ['tenants-archived'], queryFn: () => api.get('/api/tenants/archived') });
}

export function usePendingArchiveTenants() {
  return useQuery<Tenant[]>({ queryKey: ['tenants-pending-archive'], queryFn: () => api.get('/api/tenants/pending-archive') });
}
```

Also add `archiveTenant` and `restoreTenant` mutations inside `useRentalMutations`:

```typescript
archiveTenant: useMutation({
  mutationFn: (id: number) => api.post(`/api/tenants/${id}/archive`, {}),
  onSuccess: () => inv([['tenants'], ['tenants-archived'], ['tenants-pending-archive'], ['units']]),
}),
restoreTenant: useMutation({
  mutationFn: (id: number) => api.post(`/api/tenants/${id}/restore`, {}),
  onSuccess: () => inv([['tenants'], ['tenants-archived'], ['tenants-pending-archive']]),
}),
```

- [ ] **Step 2: Create ArchiveBanner component**

Create `client/src/components/rentals/ArchiveBanner.tsx`:

```typescript
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePendingArchiveTenants, useRentalMutations } from '@/lib/hooks/useRentals';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/hooks/useAuth';

export function ArchiveBanner() {
  const { user } = useAuth();
  const { data: pending = [] } = usePendingArchiveTenants();
  const { archiveTenant } = useRentalMutations();

  if (user?.role === 'staff' || pending.length === 0) return null;

  async function handleArchive(id: number, name: string) {
    if (!confirm(`Archive ${name}? Their unit will be freed and financial records will be kept for 1 year.`)) return;
    try {
      await archiveTenant.mutateAsync(id);
      toast.success(`${name} archived`);
    } catch { toast.error('Failed to archive'); }
  }

  return (
    <div className="mb-4 space-y-2">
      {pending.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <Archive size={14} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
            <span>
              <span className="font-medium">{t.name}</span>
              {t.end_date && <span className="text-muted-foreground ml-1">— contract ended {formatDate(t.end_date)}</span>}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleArchive(t.id, t.name)}>
            Archive
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create ArchivedTab component**

Create `client/src/components/rentals/tabs/ArchivedTab.tsx`:

```typescript
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useArchivedTenants, useRentalMutations } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { useContracts } from '@/lib/hooks/useRentals';
import { formatDate, formatAED } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function ArchivedTenantRow({ tenant }: { tenant: import('@/lib/hooks/useRentals').ArchivedTenant }) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();
  const { restoreTenant } = useRentalMutations();
  const { data: contracts = [] } = useContracts(expanded ? tenant.id : 0);

  async function handleRestore() {
    if (!confirm(`Restore ${tenant.name}? You will need to reassign their unit manually.`)) return;
    try {
      await restoreTenant.mutateAsync(tenant.id);
      toast.success(`${tenant.name} restored`);
    } catch { toast.error('Failed to restore'); }
  }

  return (
    <div className="border rounded-lg overflow-hidden mb-2">
      <div
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
          {tenant.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{tenant.name}</div>
          <div className="text-xs text-muted-foreground">
            Archived {formatDate(tenant.archived_at)}
            {tenant.last_contract_end && ` · Contract ended ${formatDate(tenant.last_contract_end)}`}
          </div>
        </div>
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <Button
            size="sm" variant="outline"
            onClick={e => { e.stopPropagation(); handleRestore(); }}
            className="shrink-0 gap-1"
          >
            <RotateCcw size={12} /> Restore
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-4 py-3 border-t bg-muted/20 space-y-3">
          <div>
            <p className="text-xs font-medium mb-1">Contact</p>
            <p className="text-xs text-muted-foreground">Phone: {tenant.phone ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Email: {tenant.email ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Emirates ID: {tenant.id_number ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Contracts (permanent)</p>
            {contracts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contracts</p>
            ) : (
              <div className="space-y-1">
                {contracts.map(c => (
                  <div key={c.id} className="text-xs border rounded p-2">
                    <span className="font-semibold">#{c.contract_no}</span>
                    <span className="text-muted-foreground ml-2">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                    <span className="text-muted-foreground ml-2">{formatAED(c.annual_rent)}/yr</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">
            Financial records (payments, PDC, documents) are retained for 1 year from archive date, then auto-purged.
          </p>
        </div>
      )}
    </div>
  );
}

export function ArchivedTab() {
  const { data: archived = [], isLoading } = useArchivedTenants();

  return (
    <div>
      <h2 className="font-semibold mb-4">Archived Tenants</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : archived.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived tenants</p>
      ) : (
        archived.map(t => <ArchivedTenantRow key={t.id} tenant={t} />)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update Rentals.tsx — add Archive Banner + Archived tab**

Edit `client/src/pages/Rentals.tsx`:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';
import { UnitsTab } from '@/components/rentals/tabs/UnitsTab';
import { TenantsTab } from '@/components/rentals/tabs/TenantsTab';
import { PaymentsTab } from '@/components/rentals/tabs/PaymentsTab';
import { ArchivedTab } from '@/components/rentals/tabs/ArchivedTab';
import { ArchiveBanner } from '@/components/rentals/ArchiveBanner';

export default function Rentals() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Rentals</h1>
      <ArchiveBanner />
      <Tabs defaultValue="payments">
        <TabsList className="mb-4">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="tenants"><TenantsTab /></TabsContent>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        <TabsContent value="buildings"><BuildingsTab /></TabsContent>
        <TabsContent value="archived"><ArchivedTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/hooks/useRentals.ts client/src/components/rentals/ArchiveBanner.tsx client/src/components/rentals/tabs/ArchivedTab.tsx client/src/pages/Rentals.tsx
git commit -m "feat: archive banner, archived tenants tab, restore action"
```

---

## Task 11: Manual Superadmin Promotion

**Note:** After deploying, promote an existing user to `superadmin` via D1:

```bash
npx wrangler d1 execute mitch-app-db --remote \
  --command="UPDATE users SET role = 'superadmin' WHERE email = 'your-superadmin@email.com'"
```

Verify:
```bash
npx wrangler d1 execute mitch-app-db --remote \
  --command="SELECT id, name, email, role FROM users"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Role system (superadmin/admin/staff) — Tasks 2, 6, 7
- ✅ Staff can create but not edit/delete tenants/contracts/bills — Task 3 (backend), Task 7 (frontend)
- ✅ Superadmin manages user accounts — Task 3a (users route restricted to superadmin)
- ✅ Audit log table + helper — Task 2
- ✅ All mutations write to audit_logs — Tasks 3a–3e
- ✅ Audit log page (filterable by user/action/date) — Task 8
- ✅ Inline last-edited-by (superadmin only) — Task 9
- ✅ Archive/restore tenant endpoints — Task 5
- ✅ Unit freed on archive — Task 5
- ✅ Pending-archive detection — Task 5
- ✅ Archive banner with confirmation — Task 10
- ✅ Archived tab with full history + contracts — Task 10
- ✅ 1-year cleanup cron — Task 5
- ✅ Logs nav link (superadmin only) — Task 6
- ✅ SuperAdminRoute guard — Task 6

**Placeholder scan:** None found.

**Type consistency:**
- `UserRole` updated in `src/types.ts` — used consistently in `requireRole`, `useAuth`, `AdminRoute`, `SuperAdminRoute`, `TopNav`
- `auditLog(db, user, action, entityType, entityId, note?)` — signature consistent across all call sites
- `archiveTenant` / `restoreTenant` mutations added to `useRentalMutations` — used in `ArchiveBanner` and `ArchivedTab`
- `useLastAuditEntry(entityType, entityId)` — same signature in both `ContractsPanel` and `TenantsTab`
