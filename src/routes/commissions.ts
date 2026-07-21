import { Hono } from 'hono';
import { z } from 'zod';
import { zv } from '../lib/zv';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

export const commissionSchema = z.object({
  name: z.string().min(1, 'Required'),
  amount: z.number().positive('Must be positive'),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  payment_method: z.enum(['cash', 'cheque']),
  cheque_number: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => d.payment_method !== 'cheque' || (d.cheque_number != null && d.cheque_number.trim().length > 0),
  { message: 'Cheque number is required when payment method is cheque', path: ['cheque_number'] }
);

type CommissionRow = {
  id: number;
  name: string;
  amount: number;
  paid_date: string;
  payment_method: string;
  cheque_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

const commissions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
commissions.use('*', requireAuth);

commissions.get('/', async (c) => {
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM commissions WHERE strftime('%Y-%m', paid_date) = ? ORDER BY paid_date DESC, id DESC`
  ).bind(month).all<CommissionRow>();
  const total = results.reduce((sum, r) => sum + r.amount, 0);
  return c.json({ rows: results, total });
});

commissions.post('/', requireAdmin, zv('json', commissionSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const chequeNumber = d.payment_method === 'cheque' ? (d.cheque_number ?? null) : null;
  const result = await c.env.DB.prepare(
    `INSERT INTO commissions (name, amount, paid_date, payment_method, cheque_number, notes, created_by)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.name, d.amount, d.paid_date, d.payment_method, chequeNumber, d.notes ?? null, user.sub).first<CommissionRow>();
  await auditLog(c.env.DB, user, 'commission.created', 'commission', result?.id ?? null, `Recorded commission: AED ${d.amount} from ${d.name}`);
  return c.json(result, 201);
});

commissions.put('/:id', requireAdmin, zv('json', commissionSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT id FROM commissions WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Commission not found' }, 404);
  const chequeNumber = d.payment_method === 'cheque' ? (d.cheque_number ?? null) : null;
  const result = await c.env.DB.prepare(
    `UPDATE commissions SET name = ?, amount = ?, paid_date = ?, payment_method = ?, cheque_number = ?, notes = ?
     WHERE id = ? RETURNING *`
  ).bind(d.name, d.amount, d.paid_date, d.payment_method, chequeNumber, d.notes ?? null, id).first<CommissionRow>();
  await auditLog(c.env.DB, user, 'commission.updated', 'commission', id, `Updated commission: AED ${d.amount} from ${d.name}`);
  return c.json(result);
});

commissions.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT * FROM commissions WHERE id = ?').bind(id).first<CommissionRow>();
  if (!existing) return c.json({ error: 'Commission not found' }, 404);
  await c.env.DB.prepare('DELETE FROM commissions WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'commission.deleted', 'commission', id, `Deleted commission: AED ${existing.amount} from ${existing.name}`);
  return c.json({ ok: true });
});

export default commissions;
