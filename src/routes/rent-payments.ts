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
    SELECT c.id, mg.m,
      CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END,
      'pending'
    FROM contracts c
    CROSS JOIN month_gen mg
    WHERE date(c.start_date) <= mg.m || '-28'
      AND date(c.end_date) >= mg.m || '-01'
      AND mg.m <= ?
      AND (
        c.payment_frequency = 'monthly'
        OR c.payment_frequency IS NULL
        OR (
          c.payment_frequency = 'annual'
          AND (
            (CAST(strftime('%Y', mg.m) AS INTEGER) * 12 + CAST(strftime('%m', mg.m) AS INTEGER))
            - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER))
          ) % 12 = 0
        )
      )
  `).bind(month, month).run();

  await c.env.DB.prepare(
    `UPDATE rent_payments SET status = 'overdue' WHERE month < ? AND status = 'pending'`
  ).bind(month).run();

  let query = `
    SELECT rp.*,
      CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END as expected_rent,
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
      MAX(0, (CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END)
           - CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as balance
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
  payment_method: z.enum(['cash', 'cheque']).nullable().optional(),
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
    await auditLog(c.env.DB, user, 'payment.marked_paid', 'payment', id, `Marked collected`);
  } else if (d.status) {
    await auditLog(c.env.DB, user, 'payment.status_changed', 'payment', id, `Status → ${d.status}`);
  } else {
    await auditLog(c.env.DB, user, 'payment.edited', 'payment', id, `Updated: ${Object.keys(d).join(', ')}`);
  }
  return c.json(await c.env.DB.prepare('SELECT * FROM rent_payments WHERE id = ?').bind(id).first());
});

const addEntrySchema = z.object({
  amount: z.number().positive(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

async function recomputePaymentStatus(db: D1Database, rentPaymentId: number): Promise<void> {
  const row = await db.prepare(`
    SELECT rp.month,
      CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE ROUND(c.annual_rent / 12, 2) END as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as new_sum
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; expected_rent: number; new_sum: number }>();
  if (!row) return;
  const currentMonth = new Date().toISOString().slice(0, 7);
  let status: string;
  if (row.new_sum >= row.expected_rent) status = 'collected';
  else if (row.new_sum > 0) status = 'partial';
  else if (row.month < currentMonth) status = 'overdue';
  else status = 'pending';
  await db.prepare('UPDATE rent_payments SET amount_paid = ?, status = ? WHERE id = ?')
    .bind(row.new_sum, status, rentPaymentId).run();
}

rentPayments.get('/:id/entries', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM payment_entries WHERE rent_payment_id = ? ORDER BY paid_date ASC, id ASC'
  ).bind(id).all();
  return c.json(results);
});

rentPayments.post('/:id/entries', zValidator('json', addEntrySchema), async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const d = c.req.valid('json');

  // Verify parent exists
  const parent = await c.env.DB.prepare('SELECT id FROM rent_payments WHERE id = ?').bind(rentPaymentId).first();
  if (!parent) return c.json({ error: 'Payment not found' }, 404);

  const now = new Date().toISOString();
  const entry = await c.env.DB.prepare(
    `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    rentPaymentId, d.amount, d.paid_date, d.payment_method,
    d.receipt_no ?? null, d.notes ?? null, String(user.sub), now
  ).first();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_added', 'payment', rentPaymentId,
    `Added ${d.amount} on ${d.paid_date}`);
  return c.json(entry, 201);
});

rentPayments.delete('/:id/entries/:entryId', async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const entryId = Number(c.req.param('entryId'));
  const result = await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ? AND rent_payment_id = ?')
    .bind(entryId, rentPaymentId).run();
  if (result.meta.changes === 0) return c.json({ error: 'Entry not found' }, 404);
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_deleted', 'payment', rentPaymentId,
    `Deleted entry ${entryId}`);
  return c.json({ ok: true });
});

export default rentPayments;
