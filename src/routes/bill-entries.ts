import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const billEntries = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
billEntries.use('*', requireAuth);

// GET /api/bill-entries?month=YYYY-MM
billEntries.get('/', async (c) => {
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);

  // Remove any pristine auto-created entries for bills created after this month
  await c.env.DB.prepare(`
    DELETE FROM bill_entries
    WHERE month = ?
      AND amount = 0 AND status = 'unpaid'
      AND paid_date IS NULL AND invoice_no IS NULL AND notes IS NULL
      AND (SELECT COUNT(*) FROM bill_attachments WHERE bill_entry_id = bill_entries.id) = 0
      AND bill_id IN (SELECT id FROM bills WHERE strftime('%Y-%m', created_at) > ?)
  `).bind(month, month).run();

  // Auto-create entries only for recurring bills created on or before this month
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO bill_entries (bill_id, month, amount, status)
    SELECT id, ?, 0, 'unpaid' FROM bills
    WHERE is_recurring = 1 AND strftime('%Y-%m', created_at) <= ?
  `).bind(month, month).run();

  const { results } = await c.env.DB.prepare(`
    SELECT
      be.id as entry_id, be.month, be.amount, be.status, be.paid_date,
      be.invoice_no, be.notes as entry_notes, be.updated_at,
      b.id as bill_id, b.particulars, b.account_no, b.due_day, b.is_recurring,
      c.id as category_id, c.name as category_name, c.color as category_color, c.icon as category_icon,
      (SELECT COUNT(*) FROM bill_attachments WHERE bill_entry_id = be.id) as attachment_count,
      CASE
        WHEN be.status = 'paid' THEN 'paid'
        WHEN b.due_day IS NOT NULL AND
             date(month || '-' || printf('%02d', b.due_day)) < date('now') THEN 'overdue'
        WHEN b.due_day IS NOT NULL AND
             date(month || '-' || printf('%02d', b.due_day)) <= date('now', '+7 days') THEN 'due_soon'
        ELSE 'unpaid'
      END as computed_status
    FROM bill_entries be
    JOIN bills b ON be.bill_id = b.id
    JOIN categories c ON b.category_id = c.id
    WHERE be.month = ?
    ORDER BY c.sort_order, c.name, b.particulars
  `).bind(month).all();

  return c.json(results);
});

const updateEntrySchema = z.object({
  amount: z.number().min(0).optional(),
  status: z.enum(['paid', 'unpaid']).optional(),
  paid_date: z.string().nullable().optional(),
  invoice_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/bill-entries/:id
billEntries.put('/:id', zValidator('json', updateEntrySchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const now = new Date().toISOString();
  const fields = [...Object.keys(data).map(k => `${k} = ?`), 'updated_by = ?', 'updated_at = ?'].join(', ');
  const values = [...Object.values(data), user.sub, now, id];
  await c.env.DB.prepare(`UPDATE bill_entries SET ${fields} WHERE id = ?`).bind(...values).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM bill_entries WHERE id = ?').bind(id).first());
});

// POST /api/bill-entries — one-off entry
billEntries.post('/', zValidator('json', z.object({
  bill_id: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().min(0).default(0),
})), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO bill_entries (bill_id, month, amount, status)
     VALUES (?,?,?,'unpaid') RETURNING *`
  ).bind(data.bill_id, data.month, data.amount).first();
  return c.json(result, 201);
});

export default billEntries;
