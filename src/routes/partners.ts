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
