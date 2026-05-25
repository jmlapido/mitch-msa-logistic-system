import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const properties = new Hono<{ Bindings: Env }>();
properties.use('*', requireAuth);

const propertySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['villa', 'office', 'shop', 'building', 'other']),
  address: z.string().optional(),
});

properties.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM properties ORDER BY name'
  ).all();
  return c.json(results);
});

properties.post('/', requireAdmin, zv('json', propertySchema), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO properties (name, type, address) VALUES (?,?,?) RETURNING *'
  ).bind(data.name, data.type, data.address ?? null).first();
  return c.json(result, 201);
});

properties.put('/:id', requireAdmin, zv('json', propertySchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const fields = Object.entries(data).map(([k]) => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await c.env.DB.prepare(`UPDATE properties SET ${fields} WHERE id = ?`).bind(...values).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first());
});

properties.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM properties WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default properties;
