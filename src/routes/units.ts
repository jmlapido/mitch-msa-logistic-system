import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const units = new Hono<{ Bindings: Env }>();
units.use('*', requireAuth);

const unitSchema = z.object({
  building_id: z.number().int().positive(),
  unit_no: z.string().min(1).max(20),
  type: z.enum(['room', 'shop', 'apartment', 'office', 'villa']),
  floor: z.string().optional(),
  notes: z.string().optional(),
});

units.get('/', async (c) => {
  const buildingId = c.req.query('building_id');
  let query = `
    SELECT u.*, b.name as building_name, b.type as building_type,
      l.id as lease_id, l.status as lease_status, l.end_date as lease_end,
      l.monthly_rent, t.name as tenant_name,
      CASE
        WHEN l.id IS NULL THEN 'vacant'
        WHEN l.status = 'active' AND date(l.end_date) <= date('now', '+30 days') THEN 'expiring'
        WHEN l.status = 'active' THEN 'occupied'
        ELSE 'vacant'
      END as occupancy_status
    FROM units u
    JOIN buildings b ON u.building_id = b.id
    LEFT JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
    LEFT JOIN tenants t ON l.tenant_id = t.id
  `;
  if (buildingId) query += ` WHERE u.building_id = ${Number(buildingId)}`;
  query += ' ORDER BY b.name, u.unit_no';
  const { results } = await c.env.DB.prepare(query).all();
  return c.json(results);
});

units.post('/', requireAdmin, zValidator('json', unitSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO units (building_id, unit_no, type, floor, notes) VALUES (?,?,?,?,?) RETURNING *'
  ).bind(d.building_id, d.unit_no, d.type, d.floor ?? null, d.notes ?? null).first();
  return c.json(result, 201);
});

units.put('/:id', requireAdmin, zValidator('json', unitSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE units SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM units WHERE id = ?').bind(id).first());
});

units.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM units WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default units;
