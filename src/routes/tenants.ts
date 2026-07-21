import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import { planCreditTransfer } from '../lib/paymentSweep';
import { recomputePaymentStatus } from './rent-payments';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/requireAuth';

const tenants = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
tenants.use('*', requireAuth);

const tenantSchema = z.object({
  name: z.string().min(1).max(100),
  tenant_type: z.enum(['person', 'company']).default('person'),
  phone: z.string().optional(),
  phone_alt: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  id_number: z.string().optional(),
  nationality: z.string().optional(),
  trade_license_no: z.string().optional(),
  trn: z.string().optional(),
  contact_person_name: z.string().optional(),
  contact_person_phone: z.string().optional(),
  contact_person_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});

// Active tenants list
tenants.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.*,
      c.id as lease_id,
      CASE WHEN c.id IS NOT NULL THEN
        CASE WHEN date(c.end_date) <= date('now', '+60 days') THEN 'expiring'
             ELSE 'active' END
      ELSE NULL END as lease_status,
      c.start_date, c.end_date,
      c.annual_rent, c.payment_frequency,
      ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2) as monthly_rent,
      u.unit_no, bld.name as building_name,
      (SELECT GROUP_CONCAT(x, ', ') FROM (
         SELECT DISTINCT bb.name || ' — ' || uu.unit_no AS x
         FROM contracts cc
       JOIN units uu ON cc.unit_id = uu.id
       JOIN buildings bb ON uu.building_id = bb.id
       WHERE cc.tenant_id = t.id AND date(cc.end_date) >= date('now'))) as units_summary,
      (SELECT COALESCE(SUM(
         CASE WHEN rp.status = 'partial'
           THEN (CASE
             WHEN c2.payment_frequency = 'custom' THEN
               ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
             ELSE ROUND(c2.annual_rent / MAX(1, c2.no_of_pdc), 2)
           END - rp.amount_paid)
           ELSE rp.amount
         END
       ), 0)
       FROM rent_payments rp
       JOIN contracts c2 ON rp.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp.status NOT IN ('collected')) as total_balance,
      -- Expected-rent lookup must stay consistent across the rent-payments list,
      -- recomputePaymentStatus, and this tenants.ts credit SQL. ORDER BY pc.id
      -- makes the pick deterministic if a month ever has more than one
      -- non-NULL-amount cheque row.
      -- Credit is computed from entry_sum (actual payment_entries), not
      -- rp.amount_paid: migration 0006 backfilled amount_paid on legacy rows
      -- without creating matching payment_entries rows. If we based credit on
      -- amount_paid, an apply-credit transfer's negative entry on such a row
      -- would collapse amount_paid below what any entry-backed math expects,
      -- effectively fabricating or destroying credit that never had entries
      -- behind it.
      (SELECT COALESCE(SUM(MAX(0,
         COALESCE((SELECT SUM(pe.amount) FROM payment_entries pe WHERE pe.rent_payment_id = rp.id), 0) - COALESCE(
           (SELECT pc.amount FROM pdc_cheques pc
            WHERE pc.contract_id = c2.id AND strftime('%Y-%m', pc.cheque_date) = rp.month AND pc.amount IS NOT NULL
            ORDER BY pc.id
            LIMIT 1),
           CASE
             WHEN c2.payment_frequency = 'custom' THEN
               ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
             ELSE ROUND(c2.annual_rent / MAX(1, c2.no_of_pdc), 2)
           END
         )
       )), 0)
       FROM rent_payments rp
       JOIN contracts c2 ON rp.contract_id = c2.id
       WHERE c2.tenant_id = t.id) as overpayment_credit
    FROM tenants t
    LEFT JOIN contracts c ON c.id = (
      SELECT id FROM contracts
      WHERE tenant_id = t.id AND date(end_date) >= date('now')
      ORDER BY end_date DESC LIMIT 1
    )
    LEFT JOIN units u ON c.unit_id = u.id
    LEFT JOIN buildings bld ON u.building_id = bld.id
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
    LEFT JOIN units u ON u.id = (
      SELECT unit_id FROM contracts
      WHERE tenant_id = t.id AND unit_id IS NOT NULL
      ORDER BY end_date DESC LIMIT 1
    )
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
    LEFT JOIN units u ON u.id = (
      SELECT unit_id FROM contracts
      WHERE tenant_id = t.id AND unit_id IS NOT NULL
      ORDER BY end_date DESC LIMIT 1
    )
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
    `SELECT co.*, u.unit_no, b.name as building_name,
       CASE
         WHEN co.terminated_at IS NOT NULL THEN 'terminated'
         WHEN date(co.end_date) >= date('now') THEN 'valid'
         ELSE 'expired'
       END as status
     FROM contracts co
     LEFT JOIN units u ON co.unit_id = u.id
     LEFT JOIN buildings b ON u.building_id = b.id
     WHERE co.tenant_id = ? ORDER BY co.start_date DESC`
  ).bind(id).all();
  const { results: docs } = await c.env.DB.prepare(
    "SELECT * FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? ORDER BY uploaded_at DESC"
  ).bind(id).all();
  return c.json({ ...tenant, leases, contracts, documents: docs });
});

tenants.post('/', zv('json', tenantSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const result = await c.env.DB.prepare(
    `INSERT INTO tenants (name, tenant_type, phone, phone_alt, email, address, id_number, nationality,
       trade_license_no, trn, contact_person_name, contact_person_phone, contact_person_email, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    d.name, d.tenant_type, d.phone ?? null, d.phone_alt ?? null, d.email || null, d.address ?? null,
    d.id_number ?? null, d.nationality ?? null, d.trade_license_no ?? null, d.trn ?? null,
    d.contact_person_name ?? null, d.contact_person_phone ?? null, d.contact_person_email || null,
    d.notes ?? null
  ).first();
  await auditLog(c.env.DB, user, 'tenant.created', 'tenant', (result as { id: number } | null)?.id ?? null, `Created tenant: ${d.name}`);
  return c.json(result, 201);
});

tenants.put('/:id', requireAdmin, zv('json', tenantSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  // Normalize cleared email fields ('') to NULL so PUT can actually clear them,
  // rather than storing an empty string.
  const normalized = entries.map(([k, v]) =>
    [k, (k === 'email' || k === 'contact_person_email') && v === '' ? null : v] as [string, unknown]);
  const fields = normalized.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE tenants SET ${fields} WHERE id = ?`)
    .bind(...normalized.map(([, v]) => v ?? null), id).run();
  await auditLog(c.env.DB, user, 'tenant.edited', 'tenant', id, `Updated: ${entries.map(([k]) => k).join(', ')}`);
  return c.json(await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first());
});

// Archive a tenant (admin/superadmin only)
tenants.post('/:id/archive', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ? AND status = ?').bind(id, 'active').first<{ name: string }>();
  if (!tenant) return c.json({ error: 'Tenant not found or already archived' }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE tenants SET status = 'archived', archived_at = ? WHERE id = ?"
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

// Apply a tenant's overpayment credit to their outstanding dues.
tenants.post('/:id/apply-credit', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));

  // Expected-rent lookup must stay consistent across the rent-payments list,
  // recomputePaymentStatus, and this tenants.ts credit SQL. ORDER BY pc.id
  // makes the pick deterministic if a month ever has more than one
  // non-NULL-amount cheque row.
  const expectedRentSql = `
    COALESCE(
      (SELECT pc.amount FROM pdc_cheques pc
       WHERE pc.contract_id = co.id AND strftime('%Y-%m', pc.cheque_date) = rp.month AND pc.amount IS NOT NULL
       ORDER BY pc.id
       LIMIT 1),
      CASE
        WHEN co.payment_frequency = 'custom' THEN
          ROUND(co.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = co.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(co.annual_rent / MAX(1, co.no_of_pdc), 2)
      END
    )`;

  // entry_sum (actual payment_entries total) drives CREDIT/source computation,
  // not rp.amount_paid: migration 0006 backfilled amount_paid on legacy rows
  // without creating matching payment_entries rows, so amount_paid can overstate
  // real, transferable credit on those rows. A negative entry written against
  // such a row (as apply-credit does) would collapse it below what its (absent)
  // entries can support. DUES are unaffected — what's owed is still judged
  // against amount_paid/status as before.
  const { results: rows } = await c.env.DB.prepare(`
    SELECT rp.id, rp.month, rp.status, rp.amount_paid,
      COALESCE((SELECT SUM(pe.amount) FROM payment_entries pe WHERE pe.rent_payment_id = rp.id), 0) as entry_sum,
      ${expectedRentSql} as expected_rent
    FROM rent_payments rp
    JOIN contracts co ON rp.contract_id = co.id
    WHERE co.tenant_id = ?
    ORDER BY rp.month ASC, rp.id ASC
  `).bind(id).all<{ id: number; month: string; status: string; amount_paid: number; entry_sum: number; expected_rent: number }>();

  const sources = rows
    .filter(r => r.entry_sum > r.expected_rent)
    .map(r => ({ id: r.id, month: r.month, credit: r.entry_sum - r.expected_rent }));
  const dues = rows
    .filter(r => ['pending', 'overdue', 'partial'].includes(r.status) && r.expected_rent > r.amount_paid)
    .map(r => ({ id: r.id, month: r.month, due: r.expected_rent - r.amount_paid }));

  const apps = planCreditTransfer(sources, dues);
  if (apps.length === 0) return c.json({ moved: 0, applications: [] });

  // NOTE: D1 has no multi-statement transactions (mirroring the same
  // tradeoff documented in rent-payments.ts ~252 for the overpayment sweep),
  // so this loop can't be wrapped in a single atomic commit. Each application
  // writes a linked negative/positive payment_entries pair; if the paired
  // positive insert fails we compensate by deleting the already-written
  // negative entry for that one application. If the loop still fails partway
  // (compensation itself can't undo *earlier*, already-completed
  // applications), the outer catch reconciles every touched row's status so
  // the data is at least internally consistent, then surfaces a distinct
  // error to the caller instead of pretending the whole transfer succeeded.
  const today = new Date().toISOString().slice(0, 10);
  const touched = new Set<number>();
  const completedApps: typeof apps = [];
  try {
    for (const a of apps) {
      const neg = await c.env.DB.prepare(
        `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, notes, recorded_by)
         VALUES (?,?,?,NULL,?,?) RETURNING id`
      ).bind(a.fromId, -a.amount, today, `Credit transferred to ${a.toMonth}`, user.sub).first<{ id: number }>();
      if (!neg?.id) {
        throw new Error(`Failed to insert source credit entry for rent_payment ${a.fromId}`);
      }
      try {
        await c.env.DB.prepare(
          `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, notes, recorded_by, source_entry_id)
           VALUES (?,?,?,NULL,?,?,?)`
        ).bind(a.toId, a.amount, today, `Credit applied from ${a.fromMonth}`, user.sub, neg.id).run();
      } catch (pairErr) {
        // Compensating action: the negative (source) entry was written but its
        // paired positive (destination) entry failed, so undo the negative
        // entry rather than leaving an orphaned, unlinked debit behind.
        try {
          await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ?').bind(neg.id).run();
        } catch {
          // Best-effort compensation only; the original pairErr below is what
          // gets surfaced/handled by the outer catch either way.
        }
        throw pairErr;
      }
      touched.add(a.fromId); touched.add(a.toId);
      completedApps.push(a);
    }
    for (const rowId of touched) await recomputePaymentStatus(c.env.DB, rowId);
  } catch (err) {
    // Reconcile whatever was actually written so far so no row is left with
    // an amount_paid/status that doesn't match its payment_entries.
    for (const rowId of touched) await recomputePaymentStatus(c.env.DB, rowId);
    const movedSoFar = Math.round(completedApps.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    await auditLog(c.env.DB, user, 'tenant.credit.apply_failed', 'tenant', id,
      `Credit transfer failed partway through: applied AED ${movedSoFar} across ${completedApps.length} of ${apps.length} planned transfer(s) before error: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ error: 'Credit transfer partially applied and reconciled; please review payment history', moved: movedSoFar }, 500);
  }

  const moved = Math.round(apps.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  await auditLog(c.env.DB, user, 'tenant.credit.applied', 'tenant', id, `Applied AED ${moved} overpayment credit across ${apps.length} transfer(s)`);
  return c.json({ moved, applications: apps.map(a => ({ fromMonth: a.fromMonth, toMonth: a.toMonth, amount: a.amount })) });
});

export default tenants;
