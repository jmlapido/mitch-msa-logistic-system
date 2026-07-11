import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const buildings = new Hono<{ Bindings: Env }>();
buildings.use('*', requireAuth);

const buildingSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['residential', 'commercial', 'mixed']),
  address: z.string().optional(),
  notes: z.string().optional(),
});

buildings.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM units u WHERE u.building_id = b.id) as unit_count,
      (SELECT COUNT(*) FROM units u
       WHERE u.building_id = b.id AND EXISTS (
         SELECT 1 FROM contracts c WHERE c.unit_id = u.id AND date(c.end_date) >= date('now')
       )) as occupied_count
    FROM buildings b ORDER BY b.name
  `).all();
  return c.json(results);
});

buildings.get('/:id', async (c) => {
  const b = await c.env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!b) return c.json({ error: 'Not found' }, 404);
  return c.json(b);
});

buildings.post('/', requireAdmin, zv('json', buildingSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO buildings (name, type, address, notes) VALUES (?,?,?,?) RETURNING *'
  ).bind(d.name, d.type, d.address ?? null, d.notes ?? null).first();
  return c.json(result, 201);
});

buildings.put('/:id', requireAdmin, zv('json', buildingSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ error: 'Nothing to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE buildings SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(id).first());
});

buildings.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default buildings;
