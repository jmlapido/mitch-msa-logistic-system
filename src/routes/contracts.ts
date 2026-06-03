import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const contracts = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
contracts.use('*', requireAuth);

const FREQ_PDC_COUNT: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
  custom: 0,
};

const contractSchema = z.object({
  tenant_id: z.number().int().positive(),
  contract_no: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annual_rent: z.number().min(0),
  payment_type: z.enum(['cash', 'pdc']).default('pdc'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']).default('monthly'),
  no_of_pdc: z.number().int().min(1).optional(),
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

contracts.post('/', requireAdmin, zv('json', contractSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const isPdc = d.payment_type === 'pdc';
  const payment_frequency = isPdc ? 'custom' : d.payment_frequency;
  const no_of_pdc = isPdc
    ? (d.no_of_pdc ?? 0)
    : (FREQ_PDC_COUNT[d.payment_frequency] ?? 0);
  const result = await c.env.DB.prepare(
    `INSERT INTO contracts (tenant_id, contract_no, start_date, end_date, annual_rent, payment_type, no_of_pdc, payment_frequency, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.tenant_id, d.contract_no, d.start_date, d.end_date, d.annual_rent, d.payment_type, no_of_pdc, payment_frequency, d.notes ?? null, user.sub).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'contract.created', 'contract', result?.id ?? null, `Contract #${d.contract_no}`);
  return c.json(result, 201);
});

contracts.put('/:id', requireAdmin, zv('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const patch: Record<string, unknown> = { ...d };
  if (d.payment_type === 'pdc') {
    patch.payment_frequency = 'custom';
    if (d.no_of_pdc !== undefined) patch.no_of_pdc = d.no_of_pdc;
  } else if (d.payment_frequency && d.payment_frequency !== 'custom') {
    patch.no_of_pdc = FREQ_PDC_COUNT[d.payment_frequency] ?? 0;
  }

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
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
