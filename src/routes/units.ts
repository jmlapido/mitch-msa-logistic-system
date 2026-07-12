import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const units = new Hono<{ Bindings: Env }>();
units.use('*', requireAuth);

const unitSchema = z.object({
  building_id: z.number().int().positive(),
  unit_no: z.string().min(1).max(50),
  type: z.string().min(1).max(50),
  floor: z.string().optional(),
  notes: z.string().optional(),
});

units.get('/', async (c) => {
  const buildingId = c.req.query('building_id');
  let query = `
    SELECT u.*, b.name as building_name, b.type as building_type,
      c.id as lease_id,
      CASE WHEN c.id IS NOT NULL THEN
        CASE WHEN date(c.end_date) <= date('now', '+60 days') THEN 'expiring'
             ELSE 'active' END
      ELSE NULL END as lease_status,
      c.end_date as lease_end,
      ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2) as monthly_rent,
      tn.name as tenant_name,
      tn.id as tenant_id,
      CASE
        WHEN c.id IS NOT NULL AND date(c.end_date) <= date('now', '+60 days') THEN 'expiring'
        WHEN c.id IS NOT NULL THEN 'occupied'
        ELSE 'vacant'
      END as occupancy_status
    FROM units u
    JOIN buildings b ON u.building_id = b.id
    LEFT JOIN contracts c ON c.id = (
      SELECT id FROM contracts
      WHERE unit_id = u.id AND date(end_date) >= date('now')
      ORDER BY end_date DESC LIMIT 1
    )
    LEFT JOIN tenants tn ON c.tenant_id = tn.id
  `;
  if (buildingId) query += ` WHERE u.building_id = ${Number(buildingId)}`;
  query += ' ORDER BY b.name, u.unit_no';
  const { results } = await c.env.DB.prepare(query).all();
  return c.json(results);
});

units.post('/', requireAdmin, zv('json', unitSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO units (building_id, unit_no, type, floor, notes) VALUES (?,?,?,?,?) RETURNING *'
  ).bind(d.building_id, d.unit_no, d.type, d.floor ?? null, d.notes ?? null).first();
  return c.json(result, 201);
});

const unitUpdateSchema = z.object({
  unit_no: z.string().min(1).max(50).optional(),
  type: z.string().min(1).max(50).optional(),
  floor: z.string().optional(),
  notes: z.string().optional(),
});

units.put('/:id', requireAdmin, zv('json', unitUpdateSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const { unit_no, type, floor, notes } = c.req.valid('json');
  await c.env.DB.prepare(
    'UPDATE units SET unit_no = COALESCE(?, unit_no), type = COALESCE(?, type), floor = ?, notes = ? WHERE id = ?'
  ).bind(unit_no ?? null, type ?? null, floor ?? null, notes ?? null, id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM units WHERE id = ?').bind(id).first());
});

units.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM units WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default units;
