import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import { findOverlappingContract } from '../lib/contractOverlap';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const contracts = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
contracts.use('*', requireAuth);

const contractSchema = z.object({
  tenant_id: z.number().int().positive(),
  unit_id: z.number().int().positive(),
  contract_no: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annual_rent: z.number().min(0),
  payment_type: z.enum(['cash', 'pdc']).default('pdc'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']).default('monthly').optional(),
  no_of_pdc: z.number().int().min(1),
  notes: z.string().optional(),
});

contracts.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id');
  if (!tenantId) return c.json({ error: 'tenant_id required' }, 400);
  const { results } = await c.env.DB.prepare(`
    SELECT co.*,
      u.unit_no, b.name as building_name,
      CASE WHEN date(co.end_date) >= date('now') THEN 'valid' ELSE 'expired' END as status,
      (SELECT SUM(amount) FROM pdc_cheques WHERE contract_id = co.id AND amount IS NOT NULL) as pdc_total
    FROM contracts co
    LEFT JOIN units u ON co.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    WHERE co.tenant_id = ?
    ORDER BY co.start_date DESC
  `).bind(Number(tenantId)).all();
  return c.json(results);
});

contracts.post('/', requireAdmin, zv('json', contractSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const conflict = await findOverlappingContract(c.env.DB, d.unit_id, d.start_date, d.end_date);
  if (conflict) {
    return c.json({ error: `Unit is already covered by contract #${conflict.contract_no} (${conflict.tenant_name}) for these dates` }, 409);
  }
  const isPdc = d.payment_type === 'pdc';
  const payment_frequency = isPdc ? 'custom' : 'monthly';
  const result = await c.env.DB.prepare(
    `INSERT INTO contracts (tenant_id, unit_id, contract_no, start_date, end_date, annual_rent, payment_type, no_of_pdc, payment_frequency, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.tenant_id, d.unit_id, d.contract_no, d.start_date, d.end_date, d.annual_rent, d.payment_type, d.no_of_pdc, payment_frequency, d.notes ?? null, user.sub).first<{ id: number }>();
  await auditLog(c.env.DB, user, 'contract.created', 'contract', result?.id ?? null, `Contract #${d.contract_no}`);
  return c.json(result, 201);
});

contracts.put('/:id', requireAdmin, zv('json', contractSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT unit_id, start_date, end_date FROM contracts WHERE id = ?'
  ).bind(id).first<{ unit_id: number | null; start_date: string; end_date: string }>();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const effUnitId = d.unit_id ?? existing.unit_id;
  const effStart = d.start_date ?? existing.start_date;
  const effEnd = d.end_date ?? existing.end_date;
  // Legacy backfilled contracts may already overlap another same-tenant contract on the
  // same unit (see migrations/0015-tenant-profile-first.sql). Only re-check for conflicts
  // when the unit or dates are actually changing, so an edit that doesn't move the contract
  // (e.g. notes-only) can never be permanently 409-blocked by pre-existing overlaps.
  const unitOrDatesChanged =
    effUnitId !== existing.unit_id || effStart !== existing.start_date || effEnd !== existing.end_date;
  if (effUnitId != null && unitOrDatesChanged) {
    const conflict = await findOverlappingContract(c.env.DB, effUnitId, effStart, effEnd, id);
    if (conflict) {
      return c.json({ error: `Unit is already covered by contract #${conflict.contract_no} (${conflict.tenant_name}) for these dates` }, 409);
    }
  }

  const patch: Record<string, unknown> = { ...d };
  if (d.payment_type === 'pdc') {
    patch.payment_frequency = 'custom';
  } else if (d.payment_type === 'cash') {
    patch.payment_frequency = 'monthly';
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
