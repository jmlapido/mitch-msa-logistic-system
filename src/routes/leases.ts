import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const leases = new Hono<{ Bindings: Env }>();
leases.use('*', requireAuth);

const leaseSchema = z.object({
  unit_id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthly_rent: z.number().positive(),
  deposit: z.number().min(0).default(0),
  status: z.enum(['active', 'expired', 'terminated']).default('active'),
  notes: z.string().optional(),
});

leases.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT l.*, t.name as tenant_name, t.phone as tenant_phone,
      u.unit_no, b.name as building_name, b.id as building_id
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN buildings b ON u.building_id = b.id
    ORDER BY l.status, l.end_date
  `).all();
  return c.json(results);
});

leases.get('/expiring', async (c) => {
  const days = Number(c.req.query('days') ?? 60);
  const { results } = await c.env.DB.prepare(`
    SELECT l.*, t.name as tenant_name, t.phone as tenant_phone,
      u.unit_no, b.name as building_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN buildings b ON u.building_id = b.id
    WHERE l.status = 'active'
      AND date(l.end_date) BETWEEN date('now') AND date('now', '+' || ? || ' days')
    ORDER BY l.end_date
  `).bind(days).all();
  return c.json(results);
});

leases.post('/', requireAdmin, zv('json', leaseSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO leases (unit_id, tenant_id, start_date, end_date, monthly_rent, deposit, status, notes)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(d.unit_id, d.tenant_id, d.start_date, d.end_date, d.monthly_rent, d.deposit, d.status, d.notes ?? null).first();
  return c.json(result, 201);
});

leases.put('/:id', requireAdmin, zv('json', leaseSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE leases SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM leases WHERE id = ?').bind(id).first());
});

leases.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM leases WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default leases;
