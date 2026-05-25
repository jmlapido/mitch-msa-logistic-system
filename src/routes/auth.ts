import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { verifyPassword, signJWT, verifyJWT } from '../lib/auth';
import type { Env } from '../types';

const auth = new Hono<{ Bindings: Env }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

auth.post('/login', zv('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND active = 1'
  ).bind(email).first<{
    id: number; name: string; email: string; password_hash: string; role: string;
  }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role as 'admin' | 'staff',
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };

  const token = await signJWT(payload, c.env.JWT_SECRET);
  setCookie(c, 'token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return c.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

auth.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ user: null });
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ user: null });
  return c.json({
    user: { id: payload.sub, name: payload.name, email: payload.email, role: payload.role },
  });
});

export default auth;
