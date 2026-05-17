import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const tenants = new Hono<{ Bindings: Env }>();
tenants.use('*', requireAuth);

const tenantSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  id_number: z.string().optional(),
  notes: z.string().optional(),
  unit_id: z.number().int().positive().nullable().optional(),
});

tenants.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*,
      c.id as lease_id,
      CASE WHEN c.id IS NOT NULL THEN
        CASE WHEN date(c.end_date) <= date('now', '+30 days') THEN 'expiring'
             ELSE 'active' END
      ELSE NULL END as lease_status,
      c.start_date, c.end_date,
      ROUND(c.annual_rent / 12, 2) as monthly_rent,
      u.unit_no, bld.name as building_name
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.id = (
      SELECT id FROM contracts
      WHERE tenant_id = t.id AND date(end_date) >= date('now')
      ORDER BY end_date DESC LIMIT 1
    )
    ORDER BY t.name
  `).all();
  return c.json(results);
});

tenants.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  if (!tenant) return c.json({ error: 'Not found' }, 404);
  const { results: leases } = await c.env.DB.prepare(`
    SELECT l.*, u.unit_no, b.name as building_name
    FROM leases l JOIN units u ON l.unit_id = u.id JOIN buildings b ON u.building_id = b.id
    WHERE l.tenant_id = ? ORDER BY l.start_date DESC
  `).bind(id).all();
  const { results: docs } = await c.env.DB.prepare(
    "SELECT * FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? ORDER BY uploaded_at DESC"
  ).bind(id).all();
  return c.json({ ...tenant, leases, documents: docs });
});

tenants.post('/', requireAdmin, zValidator('json', tenantSchema), async (c) => {
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO tenants (name, phone, email, id_number, notes, unit_id) VALUES (?,?,?,?,?,?) RETURNING *'
  ).bind(d.name, d.phone ?? null, d.email || null, d.id_number ?? null, d.notes ?? null, d.unit_id ?? null).first();
  return c.json(result, 201);
});

tenants.put('/:id', requireAdmin, zValidator('json', tenantSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE tenants SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first());
});

tenants.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default tenants;
