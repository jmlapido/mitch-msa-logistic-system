import { Hono } from 'hono';
import { z } from 'zod';
import { zv } from '../lib/zv';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

export const withdrawalSchema = z.object({
  withdrawn_by: z.string().min(1, 'Required'),
  amount: z.number().positive('Must be positive'),
  withdrawn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  payment_method: z.enum(['cash', 'cheque']),
  cheque_number: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => d.payment_method !== 'cheque' || (d.cheque_number != null && d.cheque_number.trim().length > 0),
  { message: 'Cheque number is required when payment method is cheque', path: ['cheque_number'] }
);

type WithdrawalRow = {
  id: number;
  withdrawn_by: string;
  amount: number;
  withdrawn_date: string;
  payment_method: string;
  cheque_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

const withdrawals = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
withdrawals.use('*', requireAuth);

const CASH_ON_HAND_SQL = `
  SELECT
    (SELECT COALESCE(SUM(amount_paid), 0) FROM rent_payments) +
    (SELECT COALESCE(SUM(amount), 0) FROM commissions) +
    (SELECT COALESCE(SUM(amount), 0) FROM partner_payments) -
    (SELECT COALESCE(SUM(amount), 0) FROM bill_entries WHERE status = 'paid') -
    (SELECT COALESCE(SUM(amount), 0) FROM withdrawals) AS cash_on_hand
`;

withdrawals.get('/', async (c) => {
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM withdrawals WHERE strftime('%Y-%m', withdrawn_date) = ? ORDER BY withdrawn_date DESC, id DESC`
  ).bind(month).all<WithdrawalRow>();
  const total = results.reduce((sum, r) => sum + r.amount, 0);
  const cashRow = await c.env.DB.prepare(CASH_ON_HAND_SQL).first<{ cash_on_hand: number }>();
  return c.json({ rows: results, total, cash_on_hand: cashRow?.cash_on_hand ?? 0 });
});

withdrawals.post('/', requireAdmin, zv('json', withdrawalSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const chequeNumber = d.payment_method === 'cheque' ? (d.cheque_number ?? null) : null;
  const result = await c.env.DB.prepare(
    `INSERT INTO withdrawals (withdrawn_by, amount, withdrawn_date, payment_method, cheque_number, notes, created_by)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.withdrawn_by, d.amount, d.withdrawn_date, d.payment_method, chequeNumber, d.notes ?? null, user.sub).first<WithdrawalRow>();
  await auditLog(c.env.DB, user, 'withdrawal.created', 'withdrawal', result?.id ?? null, `Recorded withdrawal: AED ${d.amount} by ${d.withdrawn_by}`);
  return c.json(result, 201);
});

withdrawals.put('/:id', requireAdmin, zv('json', withdrawalSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT id FROM withdrawals WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Withdrawal not found' }, 404);
  const chequeNumber = d.payment_method === 'cheque' ? (d.cheque_number ?? null) : null;
  const result = await c.env.DB.prepare(
    `UPDATE withdrawals SET withdrawn_by = ?, amount = ?, withdrawn_date = ?, payment_method = ?, cheque_number = ?, notes = ?
     WHERE id = ? RETURNING *`
  ).bind(d.withdrawn_by, d.amount, d.withdrawn_date, d.payment_method, chequeNumber, d.notes ?? null, id).first<WithdrawalRow>();
  await auditLog(c.env.DB, user, 'withdrawal.updated', 'withdrawal', id, `Updated withdrawal: AED ${d.amount} by ${d.withdrawn_by}`);
  return c.json(result);
});

withdrawals.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(id).first<WithdrawalRow>();
  if (!existing) return c.json({ error: 'Withdrawal not found' }, 404);
  await c.env.DB.prepare('DELETE FROM withdrawals WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'withdrawal.deleted', 'withdrawal', id, `Deleted withdrawal: AED ${existing.amount} by ${existing.withdrawn_by}`);
  return c.json({ ok: true });
});

export default withdrawals;
