import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const auditLogs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
auditLogs.use('*', requireAuth, requireRole('superadmin'));

auditLogs.get('/', async (c) => {
  const userId = c.req.query('user_id');
  const action = c.req.query('action');
  const entityType = c.req.query('entity_type');
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');
  const rawPage = parseInt(c.req.query('page') ?? '1', 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const binds: unknown[] = [];

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom && !DATE_RE.test(dateFrom)) return c.json({ error: 'Invalid date_from format (YYYY-MM-DD)' }, 400);
  if (dateTo && !DATE_RE.test(dateTo)) return c.json({ error: 'Invalid date_to format (YYYY-MM-DD)' }, 400);

  if (userId) {
    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) return c.json({ error: 'Invalid user_id' }, 400);
    conditions.push('user_id = ?');
    binds.push(parsedUserId);
  }
  if (action) { conditions.push('action = ?'); binds.push(action); }
  if (entityType) { conditions.push('entity_type = ?'); binds.push(entityType); }
  const entityId = c.req.query('entity_id');
  if (entityId) {
    const id = parseInt(entityId, 10);
    if (isNaN(id)) return c.json({ error: 'Invalid entity_id' }, 400);
    conditions.push('entity_id = ?'); binds.push(id);
  }
  if (dateFrom) { conditions.push("date(created_at) >= date(?)"); binds.push(dateFrom); }
  if (dateTo) { conditions.push("date(created_at) <= date(?)"); binds.push(dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM audit_logs ${where}`
  ).bind(...binds).first<{ total: number }>();

  return c.json({ results, total: countRow?.total ?? 0, page, limit });
});

auditLogs.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT user_id, user_name FROM audit_logs ORDER BY user_name'
  ).all();
  return c.json(results);
});

auditLogs.get('/actions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action'
  ).all();
  return c.json(results);
});

export default auditLogs;
