import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireRole } from './requireRole';

function makeApp(minRole: 'staff' | 'admin' | 'superadmin') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', { sub: 1, email: 'x@x.com', name: 'X', role: (c.req.header('x-role') ?? 'staff'), exp: 9999999999 });
    await next();
  });
  app.get('/test', requireRole(minRole), (c) => c.json({ ok: true }));
  return app;
}

describe('requireRole', () => {
  it('allows exact role match', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'admin' } });
    expect(res.status).toBe(200);
  });

  it('allows higher role', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'superadmin' } });
    expect(res.status).toBe(200);
  });

  it('blocks lower role', async () => {
    const app = makeApp('admin');
    const res = await app.request('/test', { headers: { 'x-role': 'staff' } });
    expect(res.status).toBe(403);
  });

  it('blocks staff from superadmin route', async () => {
    const app = makeApp('superadmin');
    const res = await app.request('/test', { headers: { 'x-role': 'staff' } });
    expect(res.status).toBe(403);
  });

  it('blocks admin from superadmin route', async () => {
    const app = makeApp('superadmin');
    const res = await app.request('/test', { headers: { 'x-role': 'admin' } });
    expect(res.status).toBe(403);
  });

  it('blocks unknown role string', async () => {
    const app = makeApp('staff');
    const res = await app.request('/test', { headers: { 'x-role': 'unknown' } });
    expect(res.status).toBe(403);
  });
});
