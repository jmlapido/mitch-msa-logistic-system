import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const categories = new Hono<{ Bindings: Env }>();

categories.use('*', requireAuth);

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  icon: z.string().max(10).default('📋'),
  sort_order: z.number().int().default(0),
});

categories.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM categories ORDER BY sort_order, name'
  ).all();
  return c.json(results);
});

categories.post('/', requireAdmin, zValidator('json', categorySchema), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO categories (name, color, icon, sort_order) VALUES (?,?,?,?) RETURNING *'
  ).bind(data.name, data.color, data.icon, data.sort_order).first();
  return c.json(result, 201);
});

categories.put('/:id', requireAdmin, zValidator('json', categorySchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const fields = Object.entries(data).map(([k]) => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await c.env.DB.prepare(`UPDATE categories SET ${fields} WHERE id = ?`).bind(...values).run();
  const updated = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  return c.json(updated);
});

categories.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default categories;
