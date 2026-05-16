import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { hashPassword } from '../lib/auth';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/requireAuth';

const users = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
users.use('*', requireAuth, requireAdmin);

users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY name'
  ).all();
  return c.json(results);
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'staff']),
});

users.post('/', zValidator('json', createSchema), async (c) => {
  const d = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(d.email).first();
  if (existing) return c.json({ error: 'Email already in use' }, 409);
  const hash = await hashPassword(d.password);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?) RETURNING id, name, email, role, active, created_at'
  ).bind(d.name, d.email, hash, d.role).first();
  return c.json(result, 201);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'staff']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

users.put('/:id', zValidator('json', updateSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const { password, active, ...rest } = c.req.valid('json');

  const updates: Record<string, unknown> = { ...rest };
  if (password) updates['password_hash'] = await hashPassword(password);
  if (active !== undefined) updates['active'] = active ? 1 : 0;

  const entries = Object.entries(updates);
  if (!entries.length) return c.json({ error: 'Nothing to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE users SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();

  return c.json(await c.env.DB.prepare(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = ?'
  ).bind(id).first());
});

users.delete('/:id', async (c) => {
  const callerId = c.get('user').sub;
  if (Number(c.req.param('id')) === callerId)
    return c.json({ error: 'Cannot deactivate your own account' }, 400);
  await c.env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default users;
