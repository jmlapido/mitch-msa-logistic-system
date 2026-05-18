import { createMiddleware } from 'hono/factory';
import type { Env, UserRole } from '../types';
import type { AuthVariables } from './requireAuth';

const ROLE_LEVEL: Record<UserRole, number> = { staff: 1, admin: 2, superadmin: 3 };

export const requireRole = (minRole: UserRole) =>
  createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user');
    if ((ROLE_LEVEL[user.role] ?? 0) < ROLE_LEVEL[minRole]) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });
