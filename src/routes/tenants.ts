import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/requireAuth';

const tenants = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
tenants.use('*', requireAuth);

const tenantSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  id_number: z.string().optional(),
  notes: z.string().optional(),
  unit_id: z.number().int().positive().nullable().optional(),
});

// Active tenants list
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
      u.unit_no, bld.name as building_name,
      (SELECT COALESCE(SUM(rp.amount), 0)
       FROM rent_payments rp
       JOIN contracts c2 ON rp.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp.status != 'collected') as total_balance
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.id = (
      SELECT id FROM contracts
      WHERE tenant_id = t.id AND date(end_date) >= date('now')
      ORDER BY end_date DESC LIMIT 1
    )
    WHERE t.status = 'active'
    ORDER BY t.name
  `).all();
  return c.json(results);
});

// Active tenants with all contracts expired — awaiting archive confirmation
tenants.get('/pending-archive', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*, u.unit_no, bld.name as building_name,
      MAX(c.end_date) as last_contract_end
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.tenant_id = t.id
    WHERE t.status = 'active'
    GROUP BY t.id
    HAVING COUNT(c.id) > 0
      AND MAX(date(c.end_date)) < date('now')
    ORDER BY last_contract_end ASC
  `).all();
  return c.json(results);
});

// Archived tenants list
tenants.get('/archived', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*,
      MAX(c.end_date) as last_contract_end,
      MAX(c.annual_rent) as last_annual_rent,
      u.unit_no, bld.name as building_name
    FROM tenants t
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
    LEFT JOIN contracts c ON c.tenant_id = t.id
    WHERE t.status = 'archived'
    GROUP BY t.id
    ORDER BY t.archived_at DESC
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
  const { results: contracts } = await c.env.DB.prepare(
    `SELECT *, CASE WHEN date(end_date) >= date('now') THEN 'valid' ELSE 'expired' END as status
     FROM contracts WHERE tenant_id = ? ORDER BY start_date DESC`
  ).bind(id).all();
  const { results: docs } = await c.env.DB.prepare(
    "SELECT * FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? ORDER BY uploaded_at DESC"
  ).bind(id).all();
  return c.json({ ...tenant, leases, contracts, documents: docs });
});

tenants.post('/', zValidator('json', tenantSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO tenants (name, phone, email, id_number, notes, unit_id) VALUES (?,?,?,?,?,?) RETURNING *'
  ).bind(d.name, d.phone ?? null, d.email || null, d.id_number ?? null, d.notes ?? null, d.unit_id ?? null).first();
  await auditLog(c.env.DB, user, 'tenant.created', 'tenant', (result as { id: number } | null)?.id ?? null, `Created tenant: ${d.name}`);
  return c.json(result, 201);
});

tenants.put('/:id', requireAdmin, zValidator('json', tenantSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE tenants SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v ?? null), id).run();
  await auditLog(c.env.DB, user, 'tenant.edited', 'tenant', id, `Updated: ${entries.map(([k]) => k).join(', ')}`);
  return c.json(await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first());
});

// Archive a tenant (admin/superadmin only)
tenants.post('/:id/archive', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ? AND status = ?').bind(id, 'active').first<{ name: string; unit_id: number | null }>();
  if (!tenant) return c.json({ error: 'Tenant not found or already archived' }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE tenants SET status = 'archived', archived_at = ?, unit_id = NULL WHERE id = ?"
  ).bind(now, id).run();

  await auditLog(c.env.DB, user, 'tenant.archived', 'tenant', id, `Archived tenant: ${tenant.name}`);
  return c.json({ ok: true });
});

// Restore a tenant (admin/superadmin only)
tenants.post('/:id/restore', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT name FROM tenants WHERE id = ? AND status = ?').bind(id, 'archived').first<{ name: string }>();
  if (!tenant) return c.json({ error: 'Tenant not found or not archived' }, 404);

  await c.env.DB.prepare(
    "UPDATE tenants SET status = 'active', archived_at = NULL WHERE id = ?"
  ).bind(id).run();

  await auditLog(c.env.DB, user, 'tenant.restored', 'tenant', id, `Restored tenant: ${tenant.name}`);
  return c.json({ ok: true });
});

tenants.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'tenant.deleted', 'tenant', id);
  return c.json({ ok: true });
});

export default tenants;
