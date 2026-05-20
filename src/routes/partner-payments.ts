// src/routes/partner-payments.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, type AuthVariables } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { Env } from '../types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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
partnerPayments.get('/', async (c) => {
  const { partner_id, from, to, status } = c.req.query();

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (partner_id) {
    conditions.push('pc.partner_id = ?');
    bindings.push(Number(partner_id));
  }
  if (from) {
    conditions.push("pc.end_date >= ?");
    bindings.push(`${from}-01`);
  }
  if (to) {
    conditions.push("pc.start_date <= ?");
    bindings.push(`${to}-28`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { results } = await c.env.DB.prepare(`
    SELECT
      pc.id as contract_id,
      pc.partner_id,
      p.company_name as partner_name,
      pc.start_date,
      pc.end_date,
      pc.expected_amount,
      pc.payment_frequency,
      COALESCE(SUM(pp.amount), 0) as total_paid,
      CASE
        WHEN COALESCE(SUM(pp.amount), 0) >= pc.expected_amount THEN 'paid'
        WHEN date(pc.end_date) < date('now') AND COALESCE(SUM(pp.amount), 0) < pc.expected_amount THEN 'overdue'
        WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
        ELSE 'pending'
      END as status
    FROM partner_contracts pc
    JOIN partners p ON p.id = pc.partner_id
    LEFT JOIN partner_payments pp ON pp.contract_id = pc.id
    ${where}
    GROUP BY pc.id
    ORDER BY pc.end_date DESC
  `).bind(...bindings).all<{
    contract_id: number;
    partner_id: number;
    partner_name: string;
    start_date: string;
    end_date: string;
    expected_amount: number;
    payment_frequency: string;
    total_paid: number;
    status: string;
  }>();

  // Post-filter by status if requested
  const rows = status ? results.filter(r => r.status === status) : results;

  // Compute stats over the (filtered) rows
  const partnerIds = new Set(rows.map(r => r.partner_id));
  let totalExpected = 0;
  let totalCollected = 0;
  let overdue = 0;
  let partial = 0;

  for (const row of rows) {
    totalExpected += row.expected_amount;
    totalCollected += row.total_paid;
    if (row.status === 'overdue') overdue += row.expected_amount - row.total_paid;
    if (row.status === 'partial') partial += row.expected_amount - row.total_paid;
  }

  return c.json({
    rows,
    stats: {
      totalPartners: partnerIds.size,
      totalExpected,
      totalCollected,
      overdue,
      partial,
    },
  });
});

// GET /api/partner-payments/by-partner/:id — payment list for detail modal
partnerPayments.get('/by-partner/:id', async (c) => {
  const id = Number(c.req.param('id'));

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
  `).bind(id).all<{
    id: number;
    partner_id: number;
    contract_id: number;
    amount: number;
    paid_date: string;
    payment_method: string;
    receipt_no: string | null;
    notes: string | null;
    created_at: string;
    contract_start: string;
    contract_end: string;
    expected_amount: number;
    attachments_json: string | null;
  }>();

  const payments = results.map(row => {
    const { attachments_json, ...rest } = row;
    let attachments: unknown[] = [];
    try {
      attachments = attachments_json ? JSON.parse(attachments_json) : [];
    } catch {
      attachments = [];
    }
    return { ...rest, attachments };
  });

  return c.json(payments);
});

// POST /api/partner-payments — record payment
partnerPayments.post('/', requireAdmin, zValidator('json', paymentSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');

  const partner = await c.env.DB.prepare('SELECT id FROM partners WHERE id = ?')
    .bind(d.partner_id).first();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);

  const contract = await c.env.DB.prepare(
    'SELECT id FROM partner_contracts WHERE id = ? AND partner_id = ?'
  ).bind(d.contract_id, d.partner_id).first();
  if (!contract) return c.json({ error: 'Contract not found for this partner' }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO partner_payments (partner_id, contract_id, amount, paid_date, payment_method, receipt_no, notes)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    d.partner_id,
    d.contract_id,
    d.amount,
    d.paid_date,
    d.payment_method,
    d.receipt_no ?? null,
    d.notes ?? null,
  ).first<{ id: number }>();

  await auditLog(c.env.DB, user, 'partner.payment.created', 'partner', d.partner_id, `Recorded payment: AED ${d.amount}`);
  return c.json(result, 201);
});

// DELETE /api/partner-payments/:id — delete payment (also deletes R2 files)
partnerPayments.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));

  const payment = await c.env.DB.prepare('SELECT * FROM partner_payments WHERE id = ?')
    .bind(id).first<{ id: number; partner_id: number; amount: number }>();
  if (!payment) return c.json({ error: 'Payment not found' }, 404);

  const { results: attachments } = await c.env.DB.prepare(
    'SELECT file_key FROM partner_payment_attachments WHERE payment_id = ?'
  ).bind(id).all<{ file_key: string }>();

  await Promise.all(attachments.map(({ file_key }) => c.env.R2.delete(file_key).catch(() => {})));
  await c.env.DB.prepare('DELETE FROM partner_payments WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'partner.payment.deleted', 'partner', payment.partner_id, `Deleted payment id ${id}: AED ${payment.amount}`);
  return c.json({ ok: true });
});

// POST /api/partner-payments/:id/attachments — upload cheque copy to R2
partnerPayments.post('/:id/attachments', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));

  const payment = await c.env.DB.prepare('SELECT partner_id FROM partner_payments WHERE id = ?')
    .bind(id).first<{ partner_id: number }>();
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
    `INSERT INTO partner_payment_attachments (payment_id, file_name, file_key, file_size, file_type)
     VALUES (?,?,?,?,?) RETURNING *`
  ).bind(id, file.name, key, file.size, file.type).first<{ id: number }>();

  await auditLog(c.env.DB, user, 'partner.payment.attachment.uploaded', 'partner', payment.partner_id, `Uploaded attachment: ${file.name}`);
  return c.json(result, 201);
});

// GET /api/partner-payments/:id/attachments/:aid/download — download attachment
partnerPayments.get('/:id/attachments/:aid/download', async (c) => {
  const aid = Number(c.req.param('aid'));

  const att = await c.env.DB.prepare('SELECT * FROM partner_payment_attachments WHERE id = ?')
    .bind(aid).first<{ file_key: string; file_name: string; file_type: string }>();
  if (!att) return c.json({ error: 'Attachment not found' }, 404);

  const obj = await c.env.R2.get(att.file_key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': att.file_type,
      'Content-Disposition': `inline; filename="${att.file_name}"`,
    },
  });
});

// DELETE /api/partner-payments/:id/attachments/:aid — delete attachment
partnerPayments.delete('/:id/attachments/:aid', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const aid = Number(c.req.param('aid'));

  const att = await c.env.DB.prepare(
    'SELECT ppa.file_key, ppa.file_name, pp.partner_id FROM partner_payment_attachments ppa JOIN partner_payments pp ON ppa.payment_id = pp.id WHERE ppa.id = ?'
  ).bind(aid).first<{ file_key: string; file_name: string; partner_id: number }>();
  if (!att) return c.json({ error: 'Attachment not found' }, 404);

  await c.env.R2.delete(att.file_key);
  await c.env.DB.prepare('DELETE FROM partner_payment_attachments WHERE id = ?').bind(aid).run();
  await auditLog(c.env.DB, user, 'partner.payment.attachment.deleted', 'partner', att.partner_id, `Deleted attachment: ${att.file_name} from payment ${id}`);
  return c.json({ ok: true });
});

export default partnerPayments;
