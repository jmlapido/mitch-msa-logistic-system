import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifyJWT } from '../lib/auth';
import type { Env, JWTPayload } from '../types';

export type AuthVariables = { user: JWTPayload };

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401);
  c.set('user', payload);
  await next();
});
