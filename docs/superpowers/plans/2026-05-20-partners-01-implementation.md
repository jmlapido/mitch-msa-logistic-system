# Partners Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Partners page for tracking companies that pay partnership fees — card grid, payment recording, contract tracking, and a Partners report tab.

**Architecture:** Six new D1 tables store partners, contacts, contracts, payments, payment attachments (cheque copies), and documents. A new Hono route file handles all partner API endpoints. The frontend adds a Partners page with two tabs (card grid + contract/payment summary list) and a detail modal, plus a Partners tab in Reports.

**Tech Stack:** Hono.js + Cloudflare D1 (SQLite) + R2 (files), React + TanStack Query, Zod validation, react-hook-form, Radix UI components, Tailwind CSS, Vitest (existing test runner).

---

## File Map

**New backend files:**
- `migrations/0007-partners.sql` — six new tables + indexes
- `src/routes/partners.ts` — partners CRUD, contacts, contracts, documents
- `src/routes/partner-payments.ts` — payment records + cheque copy attachments

**Modified backend files:**
- `src/routes/reports.ts` — add `type=partners` branch
- `src/index.ts` — mount two new route files

**New frontend files:**
- `client/src/lib/hooks/usePartners.ts` — all TanStack Query hooks + mutations
- `client/src/components/partners/tabs/PartnersTab.tsx` — card grid with sort/search/filter
- `client/src/components/partners/tabs/PaymentsTab.tsx` — contract summary list with stat cards
- `client/src/components/partners/PartnerModal.tsx` — detail modal (info, contacts, docs, contracts, payments)
- `client/src/components/reports/PartnersReportView.tsx` — report view component

**Modified frontend files:**
- `client/src/pages/Partners.tsx` — page shell (two tabs)
- `client/src/App.tsx` — add `/partners` route
- `client/src/components/layout/TopNav.tsx` — add Partners nav link
- `client/src/pages/Reports.tsx` — add Partners tab
- `client/src/components/reports/PartnersReportView.tsx` — new (listed above)

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/0007-partners.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0007-partners.sql

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
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id        INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  expected_amount   REAL NOT NULL,
  payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('monthly','quarterly','annual','one-time')),
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE partner_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id     INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id    INTEGER NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
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

CREATE INDEX idx_partner_contacts_partner   ON partner_contacts(partner_id);
CREATE INDEX idx_partner_contracts_partner  ON partner_contracts(partner_id);
CREATE INDEX idx_partner_payments_partner   ON partner_payments(partner_id);
CREATE INDEX idx_partner_payments_contract  ON partner_payments(contract_id);
CREATE INDEX idx_partner_pay_att_payment    ON partner_payment_attachments(payment_id);
CREATE INDEX idx_partner_docs_partner       ON partner_documents(partner_id);
```

- [ ] **Step 2: Apply migration locally**

```bash
npx wrangler d1 execute mitch-app-db --local --file=migrations/0007-partners.sql
```

Expected output: `Executing on local database mitch-app-db … Done`

- [ ] **Step 3: Apply migration to remote D1**

```bash
npx wrangler d1 execute mitch-app-db --file=migrations/0007-partners.sql
```

Expected output: `Executing on remote database mitch-app-db … Done`

- [ ] **Step 4: Commit**

```bash
git add migrations/0007-partners.sql
git commit -m "feat: add partners schema migration"
```

---

## Task 2: Backend — Partners Routes

**Files:**
- Create: `src/routes/partners.ts`

- [ ] **Step 1: Create the partners route file**

```typescript
// src/routes/partners.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, type AuthVariables } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

const partners = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
partners.use('*', requireAuth);

const partnerSchema = z.object({
  company_name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.string().optional(),
  phone: z.string().optional(),
});

const contractSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_amount: z.number().min(0),
  payment_frequency: z.enum(['monthly', 'quarterly', 'annual', 'one-time']),
  notes: z.string().optional(),
  status: z.enum(['active', 'expired', 'terminated']).optional(),
});

// GET /api/partners — list all partners with active contract status
partners.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      p.*,
      pc.id        as contract_id,
      pc.end_date  as contract_end,
      pc.expected_amount,
      pc.payment_frequency,
      COALESCE(pay.total_paid, 0) as total_paid,
      CASE
        WHEN pc.id IS NULL THEN 'no_contract'
        WHEN COALESCE(pay.total_paid, 0) >= pc.expected_amount THEN 'paid'
        WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
        WHEN date(pc.end_date) < date('now') THEN 'overdue'
        ELSE 'pending'
      END as status
    FROM partners p
    LEFT JOIN partner_contracts pc ON pc.id = (
      SELECT id FROM partner_contracts
      WHERE partner_id = p.id
      ORDER BY end_date DESC LIMIT 1
    )
    LEFT JOIN (
      SELECT contract_id, SUM(amount) as total_paid
      FROM partner_payments
      GROUP BY contract_id
    ) pay ON pay.contract_id = pc.id
    ORDER BY p.company_name
  `).all();
  return c.json(results);
});

// POST /api/partners
partners.post('/', requireAdmin, zValidator('json', partnerSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO partners (company_name, phone, email, notes) VALUES (?,?,?,?) RETURNING *'
  ).bind(d.company_name, d.phone ?? null, d.email || null, d.notes ?? null).first();
  return c.json(result, 201);
});

// PUT /api/partners/:id
partners.put('/:id', requireAdmin, zValidator('json', partnerSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partners SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(id).first());
});

// DELETE /api/partners/:id
partners.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));

  // Delete R2 files for payment attachments
  const { results: payAttachments } = await c.env.DB.prepare(
    `SELECT ppa.file_key FROM partner_payment_attachments ppa
     JOIN partner_payments pp ON ppa.payment_id = pp.id
     WHERE pp.partner_id = ?`
  ).bind(id).all<{ file_key: string }>();
  for (const { file_key } of payAttachments) {
    await c.env.R2.delete(file_key).catch(() => {});
  }

  // Delete R2 files for partner documents
  const { results: docs } = await c.env.DB.prepare(
    'SELECT file_key FROM partner_documents WHERE partner_id = ?'
  ).bind(id).all<{ file_key: string }>();
  for (const { file_key } of docs) {
    await c.env.R2.delete(file_key).catch(() => {});
  }

  await c.env.DB.prepare('DELETE FROM partners WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── Contacts ─────────────────────────────────────────────────────────────────

partners.get('/:id/contacts', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM partner_contacts WHERE partner_id = ? ORDER BY id'
  ).bind(id).all();
  return c.json(results);
});

partners.post('/:id/contacts', requireAdmin, zValidator('json', contactSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO partner_contacts (partner_id, name, position, phone) VALUES (?,?,?,?) RETURNING *'
  ).bind(id, d.name, d.position ?? null, d.phone ?? null).first();
  return c.json(result, 201);
});

partners.put('/:id/contacts/:cid', requireAdmin, zValidator('json', contactSchema.partial()), async (c) => {
  const cid = Number(c.req.param('cid'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partner_contacts SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), cid).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM partner_contacts WHERE id = ?').bind(cid).first());
});

partners.delete('/:id/contacts/:cid', requireAdmin, async (c) => {
  const cid = Number(c.req.param('cid'));
  await c.env.DB.prepare('DELETE FROM partner_contacts WHERE id = ?').bind(cid).run();
  return c.json({ ok: true });
});

// ── Contracts ─────────────────────────────────────────────────────────────────

partners.get('/:id/contracts', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(`
    SELECT pc.*,
      COALESCE(SUM(pp.amount), 0) as total_paid,
      CASE
        WHEN COALESCE(SUM(pp.amount), 0) >= pc.expected_amount THEN 'paid'
        WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
        WHEN date(pc.end_date) < date('now') THEN 'overdue'
        ELSE 'pending'
      END as payment_status
    FROM partner_contracts pc
    LEFT JOIN partner_payments pp ON pp.contract_id = pc.id
    WHERE pc.partner_id = ?
    GROUP BY pc.id
    ORDER BY pc.end_date DESC
  `).bind(id).all();
  return c.json(results);
});

partners.post('/:id/contracts', requireAdmin, zValidator('json', contractSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO partner_contracts (partner_id, start_date, end_date, expected_amount, payment_frequency, notes, status)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(id, d.start_date, d.end_date, d.expected_amount, d.payment_frequency, d.notes ?? null, d.status ?? 'active').first();
  return c.json(result, 201);
});

partners.put('/:id/contracts/:cid', requireAdmin, zValidator('json', contractSchema.partial()), async (c) => {
  const cid = Number(c.req.param('cid'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partner_contracts SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), cid).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM partner_contracts WHERE id = ?').bind(cid).first());
});

partners.delete('/:id/contracts/:cid', requireAdmin, async (c) => {
  const cid = Number(c.req.param('cid'));
  await c.env.DB.prepare('DELETE FROM partner_contracts WHERE id = ?').bind(cid).run();
  return c.json({ ok: true });
});

// ── Documents ─────────────────────────────────────────────────────────────────

partners.get('/:id/documents', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM partner_documents WHERE partner_id = ? ORDER BY uploaded_at DESC'
  ).bind(id).all();
  return c.json(results);
});

partners.post('/:id/documents', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const docType = String(formData.get('doc_type') || 'other');

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'File type not allowed' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'File exceeds 10MB limit' }, 400);
  if (!['contract', 'agreement', 'other'].includes(docType)) return c.json({ error: 'Invalid doc_type' }, 400);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `partners/${id}/docs/${crypto.randomUUID()}.${ext}`;
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const result = await c.env.DB.prepare(
    'INSERT INTO partner_documents (partner_id, doc_type, file_name, file_key, file_size, file_type) VALUES (?,?,?,?,?,?) RETURNING *'
  ).bind(id, docType, file.name, key, file.size, file.type).first();
  return c.json(result, 201);
});

partners.get('/:id/documents/:did/download', async (c) => {
  const did = Number(c.req.param('did'));
  const doc = await c.env.DB.prepare('SELECT * FROM partner_documents WHERE id = ?')
    .bind(did).first<{ file_key: string; file_name: string; file_type: string }>();
  if (!doc) return c.json({ error: 'Not found' }, 404);
  const obj = await c.env.R2.get(doc.file_key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': doc.file_type,
      'Content-Disposition': `inline; filename="${doc.file_name}"`,
    },
  });
});

partners.delete('/:id/documents/:did', requireAdmin, async (c) => {
  const did = Number(c.req.param('did'));
  const doc = await c.env.DB.prepare('SELECT file_key FROM partner_documents WHERE id = ?')
    .bind(did).first<{ file_key: string }>();
  if (!doc) return c.json({ error: 'Not found' }, 404);
  await c.env.R2.delete(doc.file_key);
  await c.env.DB.prepare('DELETE FROM partner_documents WHERE id = ?').bind(did).run();
  return c.json({ ok: true });
});

export default partners;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/partners.ts
git commit -m "feat: add partners backend routes (CRUD, contacts, contracts, documents)"
```

---

## Task 3: Backend — Partner Payments Routes

**Files:**
- Create: `src/routes/partner-payments.ts`

- [ ] **Step 1: Create the partner-payments route file**

```typescript
// src/routes/partner-payments.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, type AuthVariables } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

const partnerPayments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
partnerPayments.use('*', requireAuth);

const paymentSchema = z.object({
  partner_id: z.number().int().positive(),
  contract_id: z.number().int().positive(),
  amount: z.number().positive(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/partner-payments — contract-based summary for Payments tab
// Returns one row per contract (with total paid and status)
// Query params: partner_id, from (YYYY-MM), to (YYYY-MM), status
partnerPayments.get('/', async (c) => {
  const partnerId = c.req.query('partner_id') ? Number(c.req.query('partner_id')) : null;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const status = c.req.query('status');

  let query = `
    SELECT
      p.id as partner_id,
      p.company_name,
      pc.id as contract_id,
      pc.start_date,
      pc.end_date,
      pc.expected_amount,
      pc.payment_frequency,
      COALESCE(SUM(pp.amount), 0) as total_paid,
      CASE
        WHEN COALESCE(SUM(pp.amount), 0) >= pc.expected_amount THEN 'paid'
        WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
        WHEN date(pc.end_date) < date('now') THEN 'overdue'
        ELSE 'pending'
      END as status
    FROM partner_contracts pc
    JOIN partners p ON pc.partner_id = p.id
    LEFT JOIN partner_payments pp ON pp.contract_id = pc.id
    WHERE 1=1
  `;
  const binds: unknown[] = [];

  if (partnerId) { query += ' AND p.id = ?'; binds.push(partnerId); }
  if (from) { query += ' AND pc.end_date >= ?'; binds.push(from + '-01'); }
  if (to) { query += ' AND pc.start_date <= ?'; binds.push(to + '-28'); }

  query += ' GROUP BY pc.id ORDER BY p.company_name, pc.end_date DESC';

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();

  // Post-filter by status (computed field — can't filter in SQL HAVING easily with aliases)
  const filtered = status && status !== 'all'
    ? results.filter((r: Record<string, unknown>) => r.status === status)
    : results;

  // Aggregate stat cards
  const totalCollected = (filtered as { total_paid: number }[]).reduce((s, r) => s + r.total_paid, 0);
  const totalExpected = (filtered as { expected_amount: number }[]).reduce((s, r) => s + r.expected_amount, 0);
  const overdue = (filtered as { status: string; expected_amount: number; total_paid: number }[])
    .filter(r => r.status === 'overdue').reduce((s, r) => s + (r.expected_amount - r.total_paid), 0);
  const partial = (filtered as { status: string; expected_amount: number; total_paid: number }[])
    .filter(r => r.status === 'partial').reduce((s, r) => s + (r.expected_amount - r.total_paid), 0);

  return c.json({ rows: filtered, stats: { totalExpected, totalCollected, overdue, partial } });
});

// GET /api/partner-payments/by-partner/:partnerId — payments list for modal
partnerPayments.get('/by-partner/:partnerId', async (c) => {
  const partnerId = Number(c.req.param('partnerId'));
  const { results } = await c.env.DB.prepare(`
    SELECT pp.*,
      pc.start_date as contract_start,
      pc.end_date as contract_end,
      pc.expected_amount,
      (SELECT json_group_array(json_object(
        'id', ppa.id, 'file_name', ppa.file_name, 'file_type', ppa.file_type
      )) FROM partner_payment_attachments ppa WHERE ppa.payment_id = pp.id) as attachments_json
    FROM partner_payments pp
    JOIN partner_contracts pc ON pp.contract_id = pc.id
    WHERE pp.partner_id = ?
    ORDER BY pp.paid_date DESC
  `).bind(partnerId).all();

  // Parse the JSON attachment array from SQLite
  const rows = (results as Record<string, unknown>[]).map(r => ({
    ...r,
    attachments: JSON.parse((r.attachments_json as string) ?? '[]'),
    attachments_json: undefined,
  }));
  return c.json(rows);
});

// POST /api/partner-payments
partnerPayments.post('/', requireAdmin, zValidator('json', paymentSchema), async (c) => {
  const d = c.req.valid('json');
  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(d.partner_id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);
  const contract = await c.env.DB.prepare('SELECT id FROM partner_contracts WHERE id = ? AND partner_id = ?')
    .bind(d.contract_id, d.partner_id).first();
  if (!contract) return c.json({ error: 'Contract not found' }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO partner_payments (partner_id, contract_id, amount, paid_date, payment_method, receipt_no, notes)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.partner_id, d.contract_id, d.amount, d.paid_date, d.payment_method, d.receipt_no ?? null, d.notes ?? null).first();
  return c.json(result, 201);
});

// DELETE /api/partner-payments/:id
partnerPayments.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));

  // Delete R2 files for attachments
  const { results: attachments } = await c.env.DB.prepare(
    'SELECT file_key FROM partner_payment_attachments WHERE payment_id = ?'
  ).bind(id).all<{ file_key: string }>();
  for (const { file_key } of attachments) {
    await c.env.R2.delete(file_key).catch(() => {});
  }

  await c.env.DB.prepare('DELETE FROM partner_payments WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// POST /api/partner-payments/:id/attachments — upload cheque copy
partnerPayments.post('/:id/attachments', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const payment = await c.env.DB.prepare('SELECT id FROM partner_payments WHERE id = ?').bind(id).first();
  if (!payment) return c.json({ error: 'Payment not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'File type not allowed' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'File exceeds 10MB limit' }, 400);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `partners/payments/${id}/${crypto.randomUUID()}.${ext}`;
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const result = await c.env.DB.prepare(
    'INSERT INTO partner_payment_attachments (payment_id, file_name, file_key, file_size, file_type) VALUES (?,?,?,?,?) RETURNING *'
  ).bind(id, file.name, key, file.size, file.type).first();
  return c.json(result, 201);
});

// GET /api/partner-payments/:id/attachments/:aid/download
partnerPayments.get('/:id/attachments/:aid/download', async (c) => {
  const aid = Number(c.req.param('aid'));
  const att = await c.env.DB.prepare('SELECT * FROM partner_payment_attachments WHERE id = ?')
    .bind(aid).first<{ file_key: string; file_name: string; file_type: string }>();
  if (!att) return c.json({ error: 'Not found' }, 404);
  const obj = await c.env.R2.get(att.file_key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': att.file_type,
      'Content-Disposition': `inline; filename="${att.file_name}"`,
    },
  });
});

// DELETE /api/partner-payments/:id/attachments/:aid
partnerPayments.delete('/:id/attachments/:aid', requireAdmin, async (c) => {
  const aid = Number(c.req.param('aid'));
  const att = await c.env.DB.prepare('SELECT file_key FROM partner_payment_attachments WHERE id = ?')
    .bind(aid).first<{ file_key: string }>();
  if (!att) return c.json({ error: 'Not found' }, 404);
  await c.env.R2.delete(att.file_key);
  await c.env.DB.prepare('DELETE FROM partner_payment_attachments WHERE id = ?').bind(aid).run();
  return c.json({ ok: true });
});

export default partnerPayments;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/partner-payments.ts
git commit -m "feat: add partner-payments backend routes"
```

---

## Task 4: Backend — Reports Update

**Files:**
- Modify: `src/routes/reports.ts`

- [ ] **Step 1: Add the partners report branch**

Add before the final `return c.json({ error: 'Invalid report type' }, 400)` line at the bottom of the GET handler in `src/routes/reports.ts`:

```typescript
  // ── Partners Report ───────────────────────────────────────────────────────
  if (type === 'partners') {
    const fromDate = from + '-01';
    const toDate = to + '-28';

    const { results: rows } = await db.prepare(`
      SELECT
        p.company_name,
        pc.id as contract_id,
        pc.start_date,
        pc.end_date,
        pc.expected_amount,
        pc.payment_frequency,
        COALESCE(SUM(pp.amount), 0) as total_paid,
        pc.expected_amount - COALESCE(SUM(pp.amount), 0) as balance,
        CASE
          WHEN COALESCE(SUM(pp.amount), 0) >= pc.expected_amount THEN 'paid'
          WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
          WHEN date(pc.end_date) < date('now') THEN 'overdue'
          ELSE 'pending'
        END as status
      FROM partner_contracts pc
      JOIN partners p ON pc.partner_id = p.id
      LEFT JOIN partner_payments pp ON pp.contract_id = pc.id
        AND pp.paid_date BETWEEN ? AND ?
      WHERE pc.start_date <= ? AND pc.end_date >= ?
      GROUP BY pc.id
      ORDER BY p.company_name, pc.end_date DESC
    `).bind(fromDate, toDate, toDate, fromDate).all();

    const { results: payments } = await db.prepare(`
      SELECT
        p.company_name,
        pp.amount,
        pp.paid_date,
        pp.payment_method,
        pp.receipt_no,
        pp.notes
      FROM partner_payments pp
      JOIN partners p ON pp.partner_id = p.id
      WHERE pp.paid_date BETWEEN ? AND ?
      ORDER BY pp.paid_date DESC, p.company_name
    `).bind(fromDate, toDate).all();

    return c.json({ type, from, to, rows, payments });
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/reports.ts
git commit -m "feat: add partners report type to reports endpoint"
```

---

## Task 5: Wire Routes in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Import and mount the two new route files**

Add these two lines after the existing imports (around line 21, after `auditLogsRoutes`):

```typescript
import partnersRoutes from './routes/partners';
import partnerPaymentsRoutes from './routes/partner-payments';
```

Add these two lines after `app.route('/api/audit-logs', auditLogsRoutes);` (around line 46):

```typescript
app.route('/api/partners', partnersRoutes);
app.route('/api/partner-payments', partnerPaymentsRoutes);
```

- [ ] **Step 2: Verify the app still compiles**

```bash
npx wrangler dev --port 8787
```

Expected: server starts with no TypeScript errors, `GET /api/health` returns `{"ok":true}`.

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: mount partners and partner-payments routes"
```

---

## Task 6: Frontend — usePartners.ts Hooks

**Files:**
- Create: `client/src/lib/hooks/usePartners.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
// client/src/lib/hooks/usePartners.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Partner = {
  id: number;
  company_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
  contract_id?: number;
  contract_end?: string;
  expected_amount?: number;
  payment_frequency?: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  total_paid: number;
  status: 'paid' | 'partial' | 'overdue' | 'pending' | 'no_contract';
};

export type PartnerContact = {
  id: number;
  partner_id: number;
  name: string;
  position?: string;
  phone?: string;
};

export type PartnerContract = {
  id: number;
  partner_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  notes?: string;
  status: 'active' | 'expired' | 'terminated';
  total_paid: number;
  payment_status: 'paid' | 'partial' | 'overdue' | 'pending';
  created_at: string;
};

export type PartnerPayment = {
  id: number;
  partner_id: number;
  contract_id: number;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque';
  receipt_no?: string;
  notes?: string;
  created_at: string;
  contract_start: string;
  contract_end: string;
  expected_amount: number;
  attachments: PartnerPaymentAttachment[];
};

export type PartnerPaymentAttachment = {
  id: number;
  payment_id: number;
  file_name: string;
  file_type: string;
};

export type PartnerDocument = {
  id: number;
  partner_id: number;
  doc_type: 'contract' | 'agreement' | 'other';
  file_name: string;
  file_type: string;
  uploaded_at: string;
};

export type PaymentsTabRow = {
  partner_id: number;
  company_name: string;
  contract_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: string;
  total_paid: number;
  status: 'paid' | 'partial' | 'overdue' | 'pending';
};

export type PaymentsTabStats = {
  totalExpected: number;
  totalCollected: number;
  overdue: number;
  partial: number;
};

export function usePartners() {
  return useQuery<Partner[]>({ queryKey: ['partners'], queryFn: () => api.get('/api/partners') });
}

export function usePartnerContacts(partnerId: number, enabled = true) {
  return useQuery<PartnerContact[]>({
    queryKey: ['partner-contacts', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/contacts`),
    enabled: enabled && !!partnerId,
  });
}

export function usePartnerContracts(partnerId: number, enabled = true) {
  return useQuery<PartnerContract[]>({
    queryKey: ['partner-contracts', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/contracts`),
    enabled: enabled && !!partnerId,
  });
}

export function usePartnerPaymentsByPartner(partnerId: number, enabled = true) {
  return useQuery<PartnerPayment[]>({
    queryKey: ['partner-payments-by-partner', partnerId],
    queryFn: () => api.get(`/api/partner-payments/by-partner/${partnerId}`),
    enabled: enabled && !!partnerId,
  });
}

export function usePartnerDocuments(partnerId: number, enabled = true) {
  return useQuery<PartnerDocument[]>({
    queryKey: ['partner-documents', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/documents`),
    enabled: enabled && !!partnerId,
  });
}

export function usePartnerPaymentsTab(params: { partnerId?: number; from?: string; to?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params.partnerId) qs.set('partner_id', String(params.partnerId));
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  return useQuery<{ rows: PaymentsTabRow[]; stats: PaymentsTabStats }>({
    queryKey: ['partner-payments-tab', params],
    queryFn: () => api.get(`/api/partner-payments?${qs.toString()}`),
  });
}

export function usePartnerMutations() {
  const qc = useQueryClient();

  const invPartners = () => qc.invalidateQueries({ queryKey: ['partners'] });
  const invContacts = (pid: number) => qc.invalidateQueries({ queryKey: ['partner-contacts', pid] });
  const invContracts = (pid: number) => qc.invalidateQueries({ queryKey: ['partner-contracts', pid] });
  const invPayments = (pid: number) => {
    qc.invalidateQueries({ queryKey: ['partner-payments-by-partner', pid] });
    qc.invalidateQueries({ queryKey: ['partner-payments-tab'] });
    qc.invalidateQueries({ queryKey: ['partners'] });
  };
  const invDocs = (pid: number) => qc.invalidateQueries({ queryKey: ['partner-documents', pid] });

  return {
    // Partners
    createPartner: useMutation({
      mutationFn: (d: Partial<Partner>) => api.post<Partner>('/api/partners', d),
      onSuccess: invPartners,
    }),
    updatePartner: useMutation({
      mutationFn: ({ id, ...d }: Partial<Partner> & { id: number }) => api.put<Partner>(`/api/partners/${id}`, d),
      onSuccess: invPartners,
    }),
    deletePartner: useMutation({
      mutationFn: (id: number) => api.del(`/api/partners/${id}`),
      onSuccess: invPartners,
    }),

    // Contacts
    createContact: useMutation({
      mutationFn: ({ partnerId, ...d }: Partial<PartnerContact> & { partnerId: number }) =>
        api.post<PartnerContact>(`/api/partners/${partnerId}/contacts`, d),
      onSuccess: (_: unknown, v: { partnerId: number }) => invContacts(v.partnerId),
    }),
    updateContact: useMutation({
      mutationFn: ({ partnerId, id, ...d }: Partial<PartnerContact> & { partnerId: number; id: number }) =>
        api.put<PartnerContact>(`/api/partners/${partnerId}/contacts/${id}`, d),
      onSuccess: (_: unknown, v: { partnerId: number }) => invContacts(v.partnerId),
    }),
    deleteContact: useMutation({
      mutationFn: ({ partnerId, id }: { partnerId: number; id: number }) =>
        api.del(`/api/partners/${partnerId}/contacts/${id}`),
      onSuccess: (_: unknown, v: { partnerId: number }) => invContacts(v.partnerId),
    }),

    // Contracts
    createContract: useMutation({
      mutationFn: ({ partnerId, ...d }: Partial<PartnerContract> & { partnerId: number }) =>
        api.post<PartnerContract>(`/api/partners/${partnerId}/contracts`, d),
      onSuccess: (_: unknown, v: { partnerId: number }) => { invContracts(v.partnerId); invPartners(); },
    }),
    updateContract: useMutation({
      mutationFn: ({ partnerId, id, ...d }: Partial<PartnerContract> & { partnerId: number; id: number }) =>
        api.put<PartnerContract>(`/api/partners/${partnerId}/contracts/${id}`, d),
      onSuccess: (_: unknown, v: { partnerId: number }) => { invContracts(v.partnerId); invPartners(); },
    }),
    deleteContract: useMutation({
      mutationFn: ({ partnerId, id }: { partnerId: number; id: number }) =>
        api.del(`/api/partners/${partnerId}/contracts/${id}`),
      onSuccess: (_: unknown, v: { partnerId: number }) => { invContracts(v.partnerId); invPartners(); },
    }),

    // Payments
    createPayment: useMutation({
      mutationFn: (d: { partner_id: number; contract_id: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) =>
        api.post<PartnerPayment>('/api/partner-payments', d),
      onSuccess: (_: unknown, v: { partner_id: number }) => invPayments(v.partner_id),
    }),
    deletePayment: useMutation({
      mutationFn: ({ id, partnerId }: { id: number; partnerId: number }) =>
        api.del(`/api/partner-payments/${id}`),
      onSuccess: (_: unknown, v: { partnerId: number }) => invPayments(v.partnerId),
    }),

    // Payment attachments (multipart — raw fetch)
    uploadPaymentAttachment: async (paymentId: number, partnerId: number, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/partner-payments/${paymentId}/attachments`, {
        method: 'POST', body: fd, credentials: 'include',
      });
      if (!res.ok) throw new Error('Upload failed');
      invPayments(partnerId);
      return res.json();
    },
    deletePaymentAttachment: useMutation({
      mutationFn: ({ paymentId, attachmentId, partnerId: _pid }: { paymentId: number; attachmentId: number; partnerId: number }) =>
        api.del(`/api/partner-payments/${paymentId}/attachments/${attachmentId}`),
      onSuccess: (_: unknown, v: { partnerId: number }) => invPayments(v.partnerId),
    }),

    // Documents (multipart — raw fetch)
    uploadDocument: async (partnerId: number, file: File, docType: string) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      const res = await fetch(`/api/partners/${partnerId}/documents`, {
        method: 'POST', body: fd, credentials: 'include',
      });
      if (!res.ok) throw new Error('Upload failed');
      invDocs(partnerId);
      return res.json();
    },
    deleteDocument: useMutation({
      mutationFn: ({ partnerId, id }: { partnerId: number; id: number }) =>
        api.del(`/api/partners/${partnerId}/documents/${id}`),
      onSuccess: (_: unknown, v: { partnerId: number }) => invDocs(v.partnerId),
    }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/hooks/usePartners.ts
git commit -m "feat: add usePartners hooks and TypeScript types"
```

---

## Task 7: Frontend — PartnersTab (Card Grid)

**Files:**
- Create: `client/src/components/partners/tabs/PartnersTab.tsx`

- [ ] **Step 1: Create the PartnersTab component**

```tsx
// client/src/components/partners/tabs/PartnersTab.tsx
import { useState } from 'react';
import { Plus, Pencil, Trash2, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { usePartners, usePartnerMutations, type Partner } from '@/lib/hooks/usePartners';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatAED, formatDate } from '@/lib/utils';
import { PartnerModal } from '../PartnerModal';

const schema = z.object({
  company_name: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

const STATUS_STYLE: Record<string, string> = {
  paid:        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue:     'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending:     'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  no_contract: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', overdue: 'Overdue', pending: 'Pending', no_contract: 'No Contract',
};

export function PartnersTab() {
  const { data: partners = [], isLoading } = usePartners();
  const { createPartner, updatePartner, deletePartner } = usePartnerMutations();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [detail, setDetail] = useState<Partner | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'collected' | 'status'>('name');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<F>({ resolver: zodResolver(schema) });

  function openAdd() { reset({ company_name: '', phone: '', email: '', notes: '' }); setEditing(null); setOpen(true); }
  function openEdit(p: Partner) { reset({ company_name: p.company_name, phone: p.phone ?? '', email: p.email ?? '', notes: p.notes ?? '' }); setEditing(p); setOpen(true); }

  async function onSubmit(v: F) {
    try {
      if (editing) { await updatePartner.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await createPartner.mutateAsync(v); toast.success('Partner added'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(p: Partner) {
    if (!confirm(`Delete ${p.company_name}? All contacts, contracts, payments and documents will be deleted.`)) return;
    try { await deletePartner.mutateAsync(p.id); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  }

  const filtered = partners
    .filter(p => {
      const matchSearch = p.company_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.company_name.localeCompare(b.company_name);
      if (sortBy === 'collected') return b.total_paid - a.total_paid;
      const order = { overdue: 0, partial: 1, pending: 2, paid: 3, no_contract: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search partners…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs w-48"
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="name">Sort: Name A–Z</option>
            <option value="collected">Sort: Total Collected</option>
            <option value="status">Sort: Status</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
            <option value="no_contract">No Contract</option>
          </select>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Partner</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No partners found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => setDetail(p)}
              className={`border rounded-lg p-4 bg-card cursor-pointer hover:shadow-sm transition-shadow ${
                p.status === 'overdue' ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Handshake size={16} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.company_name}</div>
                    {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1">
                {p.total_paid > 0 && (
                  <p className="text-xs font-semibold text-green-600">{formatAED(p.total_paid)} collected</p>
                )}
                {p.contract_end && (
                  <p className="text-xs text-muted-foreground">
                    Contract expires {formatDate(p.contract_end)}
                  </p>
                )}
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[p.status] ?? ''}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Partner' : 'Add Partner'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Company Name *</Label>
              <Input {...register('company_name')} className="mt-1" />
              {errors.company_name && <p className="text-xs text-destructive mt-0.5">{errors.company_name.message}</p>}
            </div>
            <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
            <div>
              <Label>Email</Label>
              <Input {...register('email')} type="email" className="mt-1" />
              {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email.message}</p>}
            </div>
            <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      {detail && (
        <PartnerModal
          partner={detail}
          open={!!detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/partners/tabs/PartnersTab.tsx
git commit -m "feat: add PartnersTab card grid"
```

---

## Task 8: Frontend — PaymentsTab (Contract Summary List)

**Files:**
- Create: `client/src/components/partners/tabs/PaymentsTab.tsx`

- [ ] **Step 1: Create the PaymentsTab component**

```tsx
// client/src/components/partners/tabs/PaymentsTab.tsx
import { useState } from 'react';
import { usePartners, usePartnerPaymentsTab } from '@/lib/hooks/usePartners';
import { formatAED, formatDate, currentMonth } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function PaymentsTab() {
  const now = currentMonth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partnerId, setPartnerId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState('all');
  const [applied, setApplied] = useState<{ from: string; to: string; partnerId?: number; status: string }>({
    from: '', to: '', status: 'all',
  });

  const { data: partners = [] } = usePartners();
  const { data, isLoading } = usePartnerPaymentsTab({
    from: applied.from || undefined,
    to: applied.to || undefined,
    partnerId: applied.partnerId,
    status: applied.status !== 'all' ? applied.status : undefined,
  });

  const rows = data?.rows ?? [];
  const stats = data?.stats ?? { totalExpected: 0, totalCollected: 0, overdue: 0, partial: 0 };

  function apply() {
    setApplied({ from, to, partnerId, status: filterStatus });
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Partners" value={String(new Set(rows.map(r => r.partner_id)).size)} />
        <StatCard label="Total Collected" value={formatAED(stats.totalCollected)} valueClass="text-green-600" />
        <StatCard label="Partial Remaining" value={formatAED(stats.partial)} valueClass={stats.partial > 0 ? 'text-yellow-600' : undefined} />
        <StatCard label="Overdue" value={formatAED(stats.overdue)} valueClass={stats.overdue > 0 ? 'text-red-600' : undefined} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Partner</p>
          <select
            value={partnerId ?? ''}
            onChange={e => setPartnerId(e.target.value ? Number(e.target.value) : undefined)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="">All Partners</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.company_name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <input type="month" value={from} onChange={e => setFrom(e.target.value)}
            className="block border rounded px-2 py-1 text-xs bg-background border-border" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <input type="month" value={to} onChange={e => setTo(e.target.value)}
            className="block border rounded px-2 py-1 text-xs bg-background border-border" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <button
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded border bg-background border-border hover:bg-muted"
        >
          Apply
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contracts found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Partner</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Frequency</th>
                  <th className="text-right px-3 py-2">Expected</th>
                  <th className="text-right px-3 py-2">Collected</th>
                  <th className="text-right px-3 py-2 hidden sm:table-cell">Balance</th>
                  <th className="text-center px-3 py-2 hidden sm:table-cell">Contract End</th>
                  <th className="text-center px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => {
                  const balance = r.expected_amount - r.total_paid;
                  return (
                    <tr key={r.contract_id} className={`hover:bg-muted/20 ${r.status === 'overdue' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                      <td className="px-3 py-2 font-medium text-sm">{r.company_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell capitalize">{r.payment_frequency}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatAED(r.expected_amount)}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.total_paid > 0
                          ? <span className="text-green-600">{formatAED(r.total_paid)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">
                        {balance > 0
                          ? <span className="text-red-600 font-medium">{formatAED(balance)}</span>
                          : <span className="text-green-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-xs hidden sm:table-cell">{formatDate(r.end_date)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[r.status] ?? ''}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border rounded-lg px-4 py-3 bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/partners/tabs/PaymentsTab.tsx
git commit -m "feat: add PaymentsTab contract summary list"
```

---

## Task 9: Frontend — PartnerModal

**Files:**
- Create: `client/src/components/partners/PartnerModal.tsx`

- [ ] **Step 1: Create the PartnerModal component**

```tsx
// client/src/components/partners/PartnerModal.tsx
import { useState } from 'react';
import { Plus, Pencil, Trash2, Phone, Mail, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  usePartnerContacts, usePartnerContracts, usePartnerPaymentsByPartner,
  usePartnerDocuments, usePartnerMutations, type Partner, type PartnerContract,
} from '@/lib/hooks/usePartners';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatAED, formatDate } from '@/lib/utils';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const contactSchema = z.object({
  name: z.string().min(1, 'Required'),
  position: z.string().optional(),
  phone: z.string().optional(),
});

const contractSchema = z.object({
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  expected_amount: z.string().min(1, 'Required'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'annual', 'one-time']),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  contract_id: z.string().min(1, 'Required'),
  amount: z.string().min(1, 'Required'),
  paid_date: z.string().min(1, 'Required'),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

type ContactF = z.infer<typeof contactSchema>;
type ContractF = z.infer<typeof contractSchema>;
type PaymentF = z.infer<typeof paymentSchema>;

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

// ── Main ─────────────────────────────────────────────────────────────────────

export function PartnerModal({ partner, open, onClose }: { partner: Partner; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';
  const mutations = usePartnerMutations();

  const { data: contacts = [] } = usePartnerContacts(partner.id, open);
  const { data: contracts = [] } = usePartnerContracts(partner.id, open);
  const { data: payments = [] } = usePartnerPaymentsByPartner(partner.id, open);
  const { data: documents = [] } = usePartnerDocuments(partner.id, open);

  // Dialog states
  const [contactOpen, setContactOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner.company_name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-5">

            {/* Partner Info */}
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Partner Info</h4>
              <div className="space-y-1 text-sm">
                {partner.email && (
                  <a href={`mailto:${partner.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Mail size={13} /> {partner.email}
                  </a>
                )}
                {partner.phone && (
                  <a href={`tel:${partner.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Phone size={13} /> {partner.phone}
                  </a>
                )}
                {partner.notes && <p className="text-xs text-muted-foreground italic mt-1">{partner.notes}</p>}
              </div>
            </section>

            {/* Contacts */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Contact Persons</h4>
                {canEdit && (
                  <button onClick={() => setContactOpen(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {contacts.length === 0
                ? <p className="text-xs text-muted-foreground">No contacts yet.</p>
                : contacts.map(ct => (
                  <div key={ct.id} className="border rounded p-2 text-xs mb-1.5 bg-background">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium">{ct.name}</span>
                        {ct.position && <span className="text-muted-foreground"> · {ct.position}</span>}
                        {ct.phone && <p className="text-muted-foreground mt-0.5"><Phone size={10} className="inline mr-0.5" />{ct.phone}</p>}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => mutations.deleteContact.mutateAsync({ partnerId: partner.id, id: ct.id }).then(() => toast.success('Removed')).catch(() => toast.error('Failed'))}
                          className="p-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              }
            </section>

            {/* Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Documents</h4>
                {canEdit && (
                  <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                    <Plus size={11} /> Upload
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try { await mutations.uploadDocument(partner.id, file, 'other'); toast.success('Uploaded'); }
                        catch { toast.error('Upload failed'); }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {documents.length === 0
                ? <p className="text-xs text-muted-foreground">No documents yet.</p>
                : documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <FileText size={11} />
                      <a
                        href={`/api/partners/${partner.id}/documents/${doc.id}/download`}
                        target="_blank" rel="noreferrer"
                        className="text-primary hover:underline truncate max-w-[180px]"
                      >
                        {doc.file_name}
                      </a>
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => mutations.deleteDocument.mutateAsync({ partnerId: partner.id, id: doc.id }).then(() => toast.success('Deleted')).catch(() => toast.error('Failed'))}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))
              }
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">

            {/* Contracts */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Contracts</h4>
                {canEdit && (
                  <button onClick={() => setContractOpen(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {contracts.length === 0
                ? <p className="text-xs text-muted-foreground">No contracts yet.</p>
                : contracts.map(c => (
                  <div key={c.id} className="border rounded p-2 text-xs mb-1.5 bg-background">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium capitalize">{c.payment_frequency}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[c.payment_status] ?? ''}`}>
                            {c.payment_status}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{formatDate(c.start_date)} → {formatDate(c.end_date)}</p>
                        <p>Expected: <span className="font-medium text-foreground">{formatAED(c.expected_amount)}</span></p>
                        <p>Collected: <span className={`font-medium ${c.total_paid >= c.expected_amount ? 'text-green-600' : 'text-orange-500'}`}>{formatAED(c.total_paid)}</span></p>
                        {c.notes && <p className="italic text-muted-foreground">{c.notes}</p>}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => mutations.deleteContract.mutateAsync({ partnerId: partner.id, id: c.id }).then(() => toast.success('Deleted')).catch(() => toast.error('Failed'))}
                          className="p-0.5 text-muted-foreground hover:text-destructive ml-2"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              }
            </section>

            {/* Payment History */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Payment History</h4>
                {canEdit && contracts.length > 0 && (
                  <button onClick={() => setPaymentOpen(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Record
                  </button>
                )}
              </div>
              {payments.length === 0
                ? <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1.5">Date</th>
                          <th className="text-right px-2 py-1.5">Amount</th>
                          <th className="text-left px-2 py-1.5">Method</th>
                          <th className="text-left px-2 py-1.5">Receipt</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payments.map(p => (
                          <tr key={p.id} className="hover:bg-muted/20">
                            <td className="px-2 py-1.5">{formatDate(p.paid_date)}</td>
                            <td className="px-2 py-1.5 text-right text-green-600 font-medium">{formatAED(p.amount)}</td>
                            <td className="px-2 py-1.5 capitalize">{p.payment_method}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{p.receipt_no ?? '—'}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                {p.attachments?.map(a => (
                                  <a key={a.id} href={`/api/partner-payments/${p.id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                                    className="text-primary hover:text-primary/80" title={a.file_name}>
                                    <Download size={11} />
                                  </a>
                                ))}
                                {canEdit && p.payment_method === 'cheque' && (
                                  <label className="cursor-pointer text-muted-foreground hover:text-foreground" title="Attach cheque copy">
                                    📎
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try { await mutations.uploadPaymentAttachment(p.id, partner.id, file); toast.success('Uploaded'); }
                                        catch { toast.error('Upload failed'); }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                                {canEdit && (
                                  <button
                                    onClick={() => mutations.deletePayment.mutateAsync({ id: p.id, partnerId: partner.id }).then(() => toast.success('Deleted')).catch(() => toast.error('Failed'))}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </section>
          </div>
        </div>

        {/* Contact Form Dialog */}
        <ContactFormDialog
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          partnerId={partner.id}
          onSave={mutations.createContact.mutateAsync}
        />

        {/* Contract Form Dialog */}
        <ContractFormDialog
          open={contractOpen}
          onClose={() => setContractOpen(false)}
          partnerId={partner.id}
          onSave={mutations.createContract.mutateAsync}
        />

        {/* Payment Form Dialog */}
        <PaymentFormDialog
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          partnerId={partner.id}
          contracts={contracts}
          onSave={mutations.createPayment.mutateAsync}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-dialogs ───────────────────────────────────────────────────────────────

function ContactFormDialog({ open, onClose, partnerId, onSave }: {
  open: boolean; onClose: () => void; partnerId: number;
  onSave: (d: { partnerId: number; name: string; position?: string; phone?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ContactF>({ resolver: zodResolver(contactSchema) });
  async function onSubmit(v: ContactF) {
    try { await onSave({ partnerId, ...v }); toast.success('Contact added'); reset(); onClose(); }
    catch { toast.error('Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Contact Person</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
          <div><Label>Position</Label><Input {...register('position')} className="mt-1" /></div>
          <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Add'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContractFormDialog({ open, onClose, partnerId, onSave }: {
  open: boolean; onClose: () => void; partnerId: number;
  onSave: (d: { partnerId: number; start_date: string; end_date: string; expected_amount: number; payment_frequency: 'monthly' | 'quarterly' | 'annual' | 'one-time'; notes?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<ContractF>({
    resolver: zodResolver(contractSchema),
    defaultValues: { payment_frequency: 'annual' },
  });
  async function onSubmit(v: ContractF) {
    try {
      await onSave({ partnerId, ...v, expected_amount: Number(v.expected_amount) });
      toast.success('Contract added'); reset(); onClose();
    } catch { toast.error('Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Contract</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date *</Label><Input {...register('start_date')} type="date" className="mt-1" /></div>
            <div><Label>End Date *</Label><Input {...register('end_date')} type="date" className="mt-1" /></div>
          </div>
          <div><Label>Expected Amount (AED) *</Label><Input {...register('expected_amount')} type="number" min={0} className="mt-1" /></div>
          <div>
            <Label>Payment Frequency *</Label>
            <Select value={watch('payment_frequency')} onValueChange={v => setValue('payment_frequency', v as ContractF['payment_frequency'])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="one-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Add'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentFormDialog({ open, onClose, partnerId, contracts, onSave }: {
  open: boolean; onClose: () => void; partnerId: number; contracts: PartnerContract[];
  onSave: (d: { partner_id: number; contract_id: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<PaymentF>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { payment_method: 'cheque', paid_date: new Date().toISOString().slice(0, 10) },
  });
  async function onSubmit(v: PaymentF) {
    try {
      await onSave({ partner_id: partnerId, contract_id: Number(v.contract_id), amount: Number(v.amount), paid_date: v.paid_date, payment_method: v.payment_method, receipt_no: v.receipt_no || undefined, notes: v.notes || undefined });
      toast.success('Payment recorded'); reset(); onClose();
    } catch { toast.error('Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Contract *</Label>
            <Select value={watch('contract_id') ?? ''} onValueChange={v => setValue('contract_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {formatDate(c.start_date)} → {formatDate(c.end_date)} · {formatAED(c.expected_amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Amount (AED) *</Label><Input {...register('amount')} type="number" min={0} step="0.01" className="mt-1" /></div>
          <div><Label>Date *</Label><Input {...register('paid_date')} type="date" className="mt-1" /></div>
          <div>
            <Label>Method *</Label>
            <div className="flex gap-1 mt-1">
              {(['cash', 'cheque'] as const).map(m => (
                <button key={m} type="button" onClick={() => setValue('payment_method', m)}
                  className={`flex-1 text-xs py-1.5 rounded border capitalize transition-colors ${watch('payment_method') === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Receipt No.</Label><Input {...register('receipt_no')} className="mt-1" /></div>
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" placeholder="Optional" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/partners/PartnerModal.tsx
git commit -m "feat: add PartnerModal with contacts, contracts, documents, and payments"
```

---

## Task 10: Frontend — Partners Page + Routing + Nav

**Files:**
- Create: `client/src/pages/Partners.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/TopNav.tsx`

- [ ] **Step 1: Create the Partners page shell**

```tsx
// client/src/pages/Partners.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PartnersTab } from '@/components/partners/tabs/PartnersTab';
import { PaymentsTab } from '@/components/partners/tabs/PaymentsTab';

export default function Partners() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Partners</h1>
      <Tabs defaultValue="partners">
        <TabsList className="mb-4">
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="partners"><PartnersTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in App.tsx**

In `client/src/App.tsx`, add the import at the top:

```tsx
import Partners from '@/pages/Partners';
```

Then add the route inside the `<Routes>` block, after the Rentals route:

```tsx
<Route path="/partners" element={<Partners />} />
```

- [ ] **Step 3: Add the nav link in TopNav.tsx**

In `client/src/components/layout/TopNav.tsx`, update `BASE_NAV`:

```tsx
const BASE_NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/bills', label: 'Bills' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/partners', label: 'Partners' },
  { to: '/reports', label: 'Reports' },
];
```

- [ ] **Step 4: Start dev servers and verify in browser**

Open two terminals:

Terminal 1 (backend):
```bash
npx wrangler dev --port 8787
```

Terminal 2 (frontend):
```bash
cd client && npm run dev
```

Open http://localhost:5173 in the browser. Verify:
- "Partners" appears in the top navigation bar
- Navigating to /partners shows the page with two tabs
- Partners tab shows "No partners found." with an Add button (if admin)
- Payments tab shows "No contracts found."
- Add a partner, open its modal, add a contact, contract, and record a payment
- All CRUD operations work without errors in the browser console

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Partners.tsx client/src/App.tsx client/src/components/layout/TopNav.tsx
git commit -m "feat: add Partners page, route, and nav link"
```

---

## Task 11: Frontend — Partners Report View

**Files:**
- Create: `client/src/components/reports/PartnersReportView.tsx`
- Modify: `client/src/pages/Reports.tsx`

- [ ] **Step 1: Create PartnersReportView**

```tsx
// client/src/components/reports/PartnersReportView.tsx
import { PrintHeader } from './PrintHeader';
import { formatAED, formatDate, monthLabel } from '@/lib/utils';

type ReportRow = {
  company_name: string;
  contract_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: string;
  total_paid: number;
  balance: number;
  status: string;
};

type PaymentRow = {
  company_name: string;
  amount: number;
  paid_date: string;
  payment_method: string;
  receipt_no?: string;
  notes?: string;
};

type Props = { rows: ReportRow[]; payments: PaymentRow[]; from: string; to: string };

const STATUS_STYLE: Record<string, string> = {
  paid:    'text-green-600',
  partial: 'text-orange-500',
  overdue: 'text-red-600 font-semibold',
  pending: 'text-yellow-600',
};

export function PartnersReportView({ rows, payments, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const totalExpected = rows.reduce((s, r) => s + r.expected_amount, 0);
  const totalCollected = rows.reduce((s, r) => s + r.total_paid, 0);
  const totalBalance = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <div>
      <PrintHeader title="Partners Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Partners Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Total Expected</p>
          <p className="text-base font-semibold">{formatAED(totalExpected)}</p>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Total Collected</p>
          <p className="text-base font-semibold text-green-600">{formatAED(totalCollected)}</p>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
          <p className={`text-base font-semibold ${totalBalance > 0 ? 'text-red-600' : ''}`}>{formatAED(totalBalance)}</p>
        </div>
      </div>

      {/* Per-partner table */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">By Partner</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Partner</th>
              <th className="text-left px-3 py-2">Frequency</th>
              <th className="text-right px-3 py-2">Expected</th>
              <th className="text-right px-3 py-2">Collected</th>
              <th className="text-right px-3 py-2">Balance</th>
              <th className="text-center px-3 py-2">Contract End</th>
              <th className="text-center px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.contract_id} className={r.status === 'overdue' ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                <td className="px-3 py-1.5 font-medium">{r.company_name}</td>
                <td className="px-3 py-1.5 text-xs capitalize text-muted-foreground">{r.payment_frequency}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(r.expected_amount)}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{r.total_paid > 0 ? formatAED(r.total_paid) : '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.balance > 0 ? <span className="text-red-600 font-medium">{formatAED(r.balance)}</span> : <span className="text-green-600">—</span>}
                </td>
                <td className="px-3 py-1.5 text-center text-xs">{formatDate(r.end_date)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`text-xs capitalize ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment detail */}
      {payments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Payment Detail</h3>
          <table className="w-full text-xs border rounded-lg overflow-hidden">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2">Partner</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-center px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-left px-3 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium">{p.company_name}</td>
                  <td className="px-3 py-1.5 text-right text-green-600 font-medium">{formatAED(p.amount)}</td>
                  <td className="px-3 py-1.5 text-center">{formatDate(p.paid_date)}</td>
                  <td className="px-3 py-1.5 capitalize">{p.payment_method}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.receipt_no ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Partners tab to Reports.tsx**

In `client/src/pages/Reports.tsx`, add `'partners'` to the TABS array:

```tsx
const TABS = [
  { value: 'rental',      label: 'Rent Collection' },
  { value: 'outstanding', label: 'Outstanding'      },
  { value: 'bills',       label: 'Bills'            },
  { value: 'expiring',    label: 'Expiring Leases'  },
  { value: 'combined',    label: 'P&L Summary'      },
  { value: 'partners',    label: 'Partners'         },
];
```

Add the import at the top of `client/src/pages/Reports.tsx`:

```tsx
import { PartnersReportView } from '@/components/reports/PartnersReportView';
```

Add the tab content inside the `data ?` block, after the `combined` TabsContent:

```tsx
<TabsContent value="partners">
  <PartnersReportView
    rows={arr('rows')}
    payments={arr('payments')}
    from={from}
    to={to}
  />
</TabsContent>
```

- [ ] **Step 3: Verify in browser**

With the dev servers running:
- Open http://localhost:5173/reports
- Switch to the "Partners" tab
- Confirm the report loads and displays correctly (stat cards + per-partner table)
- Use Print / Export PDF to confirm the report prints cleanly

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/PartnersReportView.tsx client/src/pages/Reports.tsx
git commit -m "feat: add Partners report view and tab"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Partners CRUD ✓ (Task 2)
  - Contact persons CRUD ✓ (Task 2)
  - Contracts CRUD ✓ (Task 2)
  - Documents upload/download/delete ✓ (Task 2)
  - Payment recording ✓ (Task 3)
  - Cheque copy attachments ✓ (Task 3)
  - All-payments tab (contract-based) ✓ (Task 8)
  - Partner card grid with sort/filter/search ✓ (Task 7)
  - Partner detail modal ✓ (Task 9)
  - All users can view, admin can edit ✓ (canEdit checks in Tasks 7, 9)
  - Partners report (total collected, overdue, payment history) ✓ (Tasks 4, 11)
  - Nav link ✓ (Task 10)

- [x] **No placeholders** — all steps have complete code.

- [x] **Type consistency** — `Partner`, `PartnerContact`, `PartnerContract`, `PartnerPayment`, `PartnerPaymentAttachment`, `PartnerDocument` types defined in `usePartners.ts` (Task 6) and referenced consistently in Tasks 7, 8, 9.

- [x] **Mutation function signatures** — `createContact` expects `{ partnerId, name, position?, phone? }`, which matches how `ContactFormDialog` calls `onSave`. Same for contracts and payments.
