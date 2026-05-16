import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import type { AuthVariables } from './requireAuth';

export const requireAdmin = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await next();
});
