// src/routes/partners.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, type AuthVariables } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { Env } from '../types';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
function maxSizeFor(type: string) {
  return type === 'application/pdf' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
}

const partners = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
partners.use('*', requireAuth);

const partnerSchema = z.object({
  company_name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  address_street: z.string().max(200).optional(),
  address_city: z.string().max(100).optional(),
  address_country: z.string().max(100).optional(),
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

// GET /api/partners — list all partners with computed status
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
        WHEN date(pc.end_date) < date('now') AND COALESCE(pay.total_paid, 0) < pc.expected_amount THEN 'overdue'
        WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
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
  const user = c.get('user');
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO partners (company_name, phone, email, notes, address_street, address_city, address_country)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    d.company_name,
    d.phone ?? null,
    d.email || null,
    d.notes ?? null,
    d.address_street ?? null,
    d.address_city ?? null,
    d.address_country ?? null,
  ).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'partner.created', 'partner', result?.id ?? null, `Created partner: ${d.company_name}`);
  return c.json(result, 201);
});

// PUT /api/partners/:id
partners.put('/:id', requireAdmin, zValidator('json', partnerSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partners SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  const updated = await c.env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(id).first();
  if (!updated) return c.json({ error: 'Partner not found' }, 404);
  await auditLog(c.env.DB, user, 'partner.updated', 'partner', id, `Updated: ${entries.map(([k]) => k).join(', ')}`);
  return c.json(updated);
});

// POST /api/partners/:id/logo — upload logo (admin only)
partners.post('/:id/logo', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file' }, 400);

  const LOGO_ALLOWED = ['image/jpeg', 'image/png', 'image/heic'];
  if (!LOGO_ALLOWED.includes(file.type)) return c.json({ error: 'Images only (JPEG, PNG, HEIC)' }, 400);
  if (file.size > 2 * 1024 * 1024) return c.json({ error: 'Logo too large (max 2 MB)' }, 400);

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/heic' ? 'heic' : 'jpg';
  const key = `partner-logos/${id}/${crypto.randomUUID()}.${ext}`;

  // DB first
  await c.env.DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(key, id).run();

  // Then R2 — roll back on failure
  try {
    await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  } catch (err) {
    console.error('[partners] R2 logo upload failed', err);
    try {
      await c.env.DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(existing.logo_key, id).run();
    } catch (rollbackErr) {
      console.error('[partners] CRITICAL: logo_key rollback failed — DB and R2 may be inconsistent', rollbackErr);
    }
    return c.json({ error: 'Upload failed' }, 500);
  }

  // Delete old logo from R2 if it existed
  if (existing.logo_key) {
    await c.env.R2.delete(existing.logo_key).catch(err => console.error('[partners] R2 old logo delete failed', err));
  }

  await auditLog(c.env.DB, c.get('user'), 'upload_partner_logo', 'partner', id, 'Uploaded logo');
  return c.json({ key });
});

// GET /api/partners/:id/logo — serve logo (any authenticated user)
partners.get('/:id/logo', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!row || !row.logo_key) return c.json({ error: 'No logo' }, 404);

  const obj = await c.env.R2.get(row.logo_key);
  if (!obj) return c.json({ error: 'Not found' }, 404);

  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

// DELETE /api/partners/:id/logo — delete logo (admin only)
partners.delete('/:id/logo', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!row.logo_key) return c.json({ ok: true }); // already no logo

  await c.env.DB.prepare('UPDATE partners SET logo_key = NULL WHERE id = ?').bind(id).run();
  await c.env.R2.delete(row.logo_key).catch(err => console.error('[partners] R2 logo delete failed', err));
  await auditLog(c.env.DB, user, 'delete_partner_logo', 'partner', id, 'Deleted logo');
  return c.json({ ok: true });
});

// DELETE /api/partners/:id
partners.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const partner = await c.env.DB.prepare('SELECT company_name, logo_key FROM partners WHERE id = ?')
    .bind(id).first<{ company_name: string; logo_key: string | null }>();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);

  // Clean up logo from R2
  if (partner.logo_key) {
    await c.env.R2.delete(partner.logo_key).catch(err => console.error('[partners] R2 logo delete on cascade failed', err));
  }

  const [{ results: payAttachments }, { results: docs }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ppa.file_key FROM partner_payment_attachments ppa
       JOIN partner_payments pp ON ppa.payment_id = pp.id
       WHERE pp.partner_id = ?`
    ).bind(id).all<{ file_key: string }>(),
    c.env.DB.prepare('SELECT file_key FROM partner_documents WHERE partner_id = ?')
      .bind(id).all<{ file_key: string }>(),
  ]);

  await Promise.all([
    ...payAttachments.map(({ file_key }) =>
      c.env.R2.delete(file_key).catch(err =>
        console.error('[partners] R2 delete failed', { file_key, err })
      )
    ),
    ...docs.map(({ file_key }) =>
      c.env.R2.delete(file_key).catch(err =>
        console.error('[partners] R2 delete failed', { file_key, err })
      )
    ),
  ]);

  await c.env.DB.prepare('DELETE FROM partners WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'partner.deleted', 'partner', id, `Deleted partner: ${partner.company_name}`);
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
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO partner_contacts (partner_id, name, position, phone) VALUES (?,?,?,?) RETURNING *'
  ).bind(id, d.name, d.position ?? null, d.phone ?? null).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'partner.contact.created', 'partner', id, `Added contact: ${d.name}`);
  return c.json(result, 201);
});

partners.put('/:id/contacts/:cid', requireAdmin, zValidator('json', contactSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const cid = Number(c.req.param('cid'));
  const existing = await c.env.DB.prepare(
    'SELECT id FROM partner_contacts WHERE id = ? AND partner_id = ?'
  ).bind(cid, id).first();
  if (!existing) return c.json({ error: 'Contact not found' }, 404);
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partner_contacts SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), cid).run();
  const updated = await c.env.DB.prepare('SELECT * FROM partner_contacts WHERE id = ?').bind(cid).first();
  await auditLog(c.env.DB, user, 'partner.contact.updated', 'partner', id, `Updated contact ${cid}`);
  return c.json(updated);
});

partners.delete('/:id/contacts/:cid', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const cid = Number(c.req.param('cid'));
  const contact = await c.env.DB.prepare(
    'SELECT id FROM partner_contacts WHERE id = ? AND partner_id = ?'
  ).bind(cid, id).first();
  if (!contact) return c.json({ error: 'Contact not found' }, 404);
  await c.env.DB.prepare('DELETE FROM partner_contacts WHERE id = ?').bind(cid).run();
  await auditLog(c.env.DB, user, 'partner.contact.deleted', 'partner', id, `Deleted contact ${cid}`);
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
        WHEN date(pc.end_date) < date('now') AND COALESCE(SUM(pp.amount), 0) < pc.expected_amount THEN 'overdue'
        WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
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
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO partner_contracts (partner_id, start_date, end_date, expected_amount, payment_frequency, notes, status)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(id, d.start_date, d.end_date, d.expected_amount, d.payment_frequency, d.notes ?? null, d.status ?? 'active').first<{ id: number }>();
  await auditLog(c.env.DB, user, 'partner.contract.created', 'partner', id, `Added contract ${d.start_date}–${d.end_date}`);
  return c.json(result, 201);
});

partners.put('/:id/contracts/:cid', requireAdmin, zValidator('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const cid = Number(c.req.param('cid'));
  const existing = await c.env.DB.prepare(
    'SELECT id FROM partner_contracts WHERE id = ? AND partner_id = ?'
  ).bind(cid, id).first();
  if (!existing) return c.json({ error: 'Contract not found' }, 404);
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE partner_contracts SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), cid).run();
  const updated = await c.env.DB.prepare('SELECT * FROM partner_contracts WHERE id = ?').bind(cid).first();
  await auditLog(c.env.DB, user, 'partner.contract.updated', 'partner', id, `Updated contract ${cid}`);
  return c.json(updated);
});

partners.delete('/:id/contracts/:cid', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const cid = Number(c.req.param('cid'));
  const contract = await c.env.DB.prepare(
    'SELECT id FROM partner_contracts WHERE id = ? AND partner_id = ?'
  ).bind(cid, id).first();
  if (!contract) return c.json({ error: 'Contract not found' }, 404);
  await c.env.DB.prepare('DELETE FROM partner_contracts WHERE id = ?').bind(cid).run();
  await auditLog(c.env.DB, user, 'partner.contract.deleted', 'partner', id, `Deleted contract ${cid}`);
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
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const docType = String(formData.get('doc_type') || 'other');

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'File type not allowed' }, 400);
  if (file.size > maxSizeFor(file.type)) return c.json({ error: 'File too large (images/docs: 5 MB, PDF: 20 MB)' }, 400);
  if (!['contract', 'agreement', 'other'].includes(docType)) return c.json({ error: 'Invalid doc_type' }, 400);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `partners/${id}/docs/${crypto.randomUUID()}.${ext}`;

  const result = await c.env.DB.prepare(
    'INSERT INTO partner_documents (partner_id, doc_type, file_name, file_key, file_size, file_type) VALUES (?,?,?,?,?,?) RETURNING *'
  ).bind(id, docType, file.name, key, file.size, file.type).first<{ id: number }>();

  try {
    await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  } catch (err) {
    await c.env.DB.prepare('DELETE FROM partner_documents WHERE id = ?')
      .bind((result as { id: number }).id).run().catch(() => {});
    console.error('[partners] R2 upload failed, rolled back DB record', { key, err });
    return c.json({ error: 'File upload failed' }, 500);
  }

  await auditLog(c.env.DB, user, 'partner.document.uploaded', 'partner', id, `Uploaded doc: ${file.name}`);
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
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const did = Number(c.req.param('did'));
  const doc = await c.env.DB.prepare('SELECT file_key, file_name FROM partner_documents WHERE id = ?')
    .bind(did).first<{ file_key: string; file_name: string }>();
  if (!doc) return c.json({ error: 'Not found' }, 404);
  await c.env.R2.delete(doc.file_key);
  await c.env.DB.prepare('DELETE FROM partner_documents WHERE id = ?').bind(did).run();
  await auditLog(c.env.DB, user, 'partner.document.deleted', 'partner', id, `Deleted doc: ${doc.file_name}`);
  return c.json({ ok: true });
});

export default partners;
