import { Hono } from 'hono';
import { zv } from '../lib/zv';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { auditLog } from '../lib/auditLog';
import { planOverpaymentSweep, type OutstandingRow } from '../lib/paymentSweep';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const rentPayments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
rentPayments.use('*', requireAuth);

rentPayments.get('/', async (c) => {
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);
  const buildingId = c.req.query('building_id');

  // Sync rent_payments.amount with the actual per-cheque amount from pdc_cheques.
  // This fixes stale amounts stored at insert time vs the manually-set cheque amounts.
  await c.env.DB.prepare(`
    UPDATE rent_payments
    SET amount = (
      SELECT pc.amount FROM pdc_cheques pc
      WHERE pc.contract_id = rent_payments.contract_id
        AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
        AND pc.amount IS NOT NULL
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = rent_payments.contract_id AND c.payment_type IN ('pdc', 'cash')
    )
    AND EXISTS (
      SELECT 1 FROM pdc_cheques pc
      WHERE pc.contract_id = rent_payments.contract_id
        AND strftime('%Y-%m', pc.cheque_date) = rent_payments.month
        AND pc.amount IS NOT NULL
    )
  `).run();

  // Remove PDC rent_payment rows with no matching cheque and no payment data.
  // Safe: only removes pending/overdue rows with zero amount_paid and no entries.
  await c.env.DB.prepare(`
    DELETE FROM rent_payments
    WHERE id IN (
      SELECT rp.id FROM rent_payments rp
      JOIN contracts c ON rp.contract_id = c.id
      WHERE c.payment_type = 'pdc'
        AND rp.amount_paid = 0
        AND rp.status IN ('pending', 'overdue')
        AND NOT EXISTS (
          SELECT 1 FROM pdc_cheques pc
          WHERE pc.contract_id = rp.contract_id
            AND strftime('%Y-%m', pc.cheque_date) = rp.month
        )
        AND NOT EXISTS (
          SELECT 1 FROM payment_entries pe WHERE pe.rent_payment_id = rp.id
        )
    )
  `).run();

  await c.env.DB.prepare(`
    WITH RECURSIVE month_gen(m) AS (
      SELECT strftime('%Y-%m', MIN(start_date)) FROM contracts
      UNION ALL
      SELECT strftime('%Y-%m', m || '-01', '+1 month')
      FROM month_gen WHERE m < ?
    )
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT c.id, mg.m,
      ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2),
      'pending'
    FROM contracts c
    CROSS JOIN month_gen mg
    WHERE date(c.start_date) <= mg.m || '-28'
      AND date(c.end_date) >= mg.m || '-01'
      AND mg.m <= ?
      AND c.payment_type = 'cash'
  `).bind(month, month).run();

  // Custom frequency: generate one rent_payment per pdc_cheques entry
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT
      c.id,
      strftime('%Y-%m', pc.cheque_date),
      ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2),
      'pending'
    FROM contracts c
    JOIN pdc_cheques pc ON pc.contract_id = c.id
    WHERE (c.payment_frequency = 'custom' OR c.payment_type = 'pdc')
      AND pc.cheque_date IS NOT NULL
      AND strftime('%Y-%m', pc.cheque_date) <= ?
  `).bind(month).run();

  await c.env.DB.prepare(
    `UPDATE rent_payments SET status = 'overdue' WHERE month < ? AND status = 'pending'`
  ).bind(month).run();

  let query = `
    SELECT rp.*,
      CASE
        WHEN c.payment_type = 'pdc' THEN
          COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
        ELSE
          COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2))
      END as expected_rent,
      t.id as tenant_id, t.name as tenant_name, t.phone as tenant_phone, t.email as tenant_email,
      u.unit_no, u.type as unit_type,
      b.id as building_id, b.name as building_name,
      c.payment_type,
      CASE
        WHEN c.payment_type = 'cash' THEN
          COALESCE(pc.cheque_date, rp.month || '-' || printf('%02d',
            MIN(
              CAST(strftime('%d', c.start_date) AS INTEGER),
              CAST(strftime('%d', date(rp.month || '-01', '+1 month', '-1 day')) AS INTEGER)
            )
          ))
        WHEN c.payment_type = 'pdc' THEN
          pc.cheque_date
        ELSE NULL
      END as due_date,
      (SELECT COALESCE(SUM(
         CASE WHEN rp2.status = 'partial'
           THEN (CASE
             WHEN c2.payment_frequency = 'custom' THEN
               ROUND(c2.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c2.id AND cheque_date IS NOT NULL)), 2)
             ELSE ROUND(c2.annual_rent / MAX(1, c2.no_of_pdc), 2)
           END - rp2.amount_paid)
           ELSE rp2.amount
         END
       ), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status NOT IN ('collected')
         AND rp2.month < ?) as tenant_overdue,
      MAX(0, (CASE
        WHEN c.payment_type = 'pdc' THEN
          COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2))
        ELSE
          COALESCE(pc.amount, ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2))
      END) - rp.amount_paid) as balance,
      COALESCE((SELECT SUM(pe.amount) FROM payment_entries pe WHERE pe.rent_payment_id = rp.id AND pe.payment_method = 'cash'), 0) as cash_collected,
      COALESCE((SELECT SUM(pe.amount) FROM payment_entries pe WHERE pe.rent_payment_id = rp.id AND pe.payment_method = 'cheque'), 0) as cheque_collected
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.month = ?
  `;
  const binds: unknown[] = [month, month];
  if (buildingId) { query += ' AND b.id = ?'; binds.push(Number(buildingId)); }
  query += ' ORDER BY b.name, u.unit_no';

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

const updatePaymentSchema = z.object({
  status: z.enum(['collected', 'pending', 'overdue', 'partial']).optional(),
  notes: z.string().nullable().optional(),
});

rentPayments.put('/:id', zv('json', updatePaymentSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const now = new Date().toISOString();
  const entries = [...Object.entries(d), ['recorded_by', user.sub], ['recorded_at', now]];
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE rent_payments SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  if (d.status === 'collected') {
    await auditLog(c.env.DB, user, 'payment.marked_paid', 'payment', id, `Marked collected`);
  } else if (d.status) {
    await auditLog(c.env.DB, user, 'payment.status_changed', 'payment', id, `Status → ${d.status}`);
  } else {
    await auditLog(c.env.DB, user, 'payment.edited', 'payment', id, `Updated: ${Object.keys(d).join(', ')}`);
  }
  return c.json(await c.env.DB.prepare('SELECT * FROM rent_payments WHERE id = ?').bind(id).first());
});

const addEntrySchema = z.object({
  amount: z.number().positive(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

async function recomputePaymentStatus(db: D1Database, rentPaymentId: number): Promise<void> {
  const row = await db.prepare(`
    SELECT rp.month,
      COALESCE(
        CASE WHEN c.payment_type IN ('pdc', 'cash') THEN pc.amount ELSE NULL END,
        CASE
          WHEN c.payment_frequency = 'custom' THEN
            ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
          ELSE ROUND(c.annual_rent / MAX(1, c.no_of_pdc), 2)
        END
      ) as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as new_sum
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; expected_rent: number; new_sum: number }>();
  if (!row) return;
  const currentMonth = new Date().toISOString().slice(0, 7);
  let status: string;
  if (row.new_sum >= row.expected_rent - 1) status = 'collected';
  else if (row.new_sum > 0) status = 'partial';
  else if (row.month < currentMonth) status = 'overdue';
  else status = 'pending';
  await db.prepare('UPDATE rent_payments SET amount_paid = ?, status = ? WHERE id = ?')
    .bind(row.new_sum, status, rentPaymentId).run();
}

rentPayments.get('/:id/entries', async (c) => {
  const id = Number(c.req.param('id'));
  const parent = await c.env.DB.prepare('SELECT id FROM rent_payments WHERE id = ?').bind(id).first();
  if (!parent) return c.json({ error: 'Payment not found' }, 404);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM payment_entries WHERE rent_payment_id = ? ORDER BY paid_date ASC, id ASC'
  ).bind(id).all();
  return c.json(results);
});

rentPayments.post('/:id/entries', zv('json', addEntrySchema), async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const d = c.req.valid('json');

  const parent = await c.env.DB.prepare('SELECT id FROM rent_payments WHERE id = ?').bind(rentPaymentId).first();
  if (!parent) return c.json({ error: 'Payment not found' }, 404);

  const expectedRentSql = `
    COALESCE(
      CASE WHEN c.payment_type = 'pdc' THEN pc.amount ELSE NULL END,
      CASE
        WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
        WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
        WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
        WHEN c.payment_frequency = 'custom'      THEN
          ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(c.annual_rent / 12.0, 2)
      END
    )`;

  const target = await c.env.DB.prepare(`
    SELECT rp.month, c.tenant_id, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id AND c.payment_type = 'pdc'
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE rp.id = ?
  `).bind(rentPaymentId).first<{ month: string; tenant_id: number; expected_rent: number; amount_paid: number }>();

  const { results: candidateRows } = await c.env.DB.prepare(`
    SELECT rp.id, ${expectedRentSql} as expected_rent,
      COALESCE((SELECT SUM(amount) FROM payment_entries WHERE rent_payment_id = rp.id), 0) as amount_paid
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    LEFT JOIN pdc_cheques pc ON pc.id = (
      SELECT id FROM pdc_cheques
      WHERE contract_id = c.id AND c.payment_type = 'pdc'
        AND strftime('%Y-%m', cheque_date) = rp.month
      LIMIT 1
    )
    WHERE c.tenant_id = ? AND rp.id != ? AND rp.status IN ('pending', 'overdue', 'partial')
    ORDER BY rp.month ASC, rp.id ASC
  `).bind(target!.tenant_id, rentPaymentId).all<{ id: number; expected_rent: number; amount_paid: number }>();

  const otherOutstanding: OutstandingRow[] = candidateRows.map(r => ({
    id: r.id, expectedRent: r.expected_rent, amountPaid: r.amount_paid,
  }));

  const plan = planOverpaymentSweep(d.amount, target!.expected_rent, target!.amount_paid, otherOutstanding);

  const now = new Date().toISOString();
  const entry = await c.env.DB.prepare(
    `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
     VALUES (?,?,?,?,?,?,?,?,NULL) RETURNING *`
  ).bind(
    rentPaymentId, plan.targetAmount, d.paid_date, d.payment_method,
    d.receipt_no ?? null, d.notes ?? null, String(user.sub), now
  ).first<{ id: number }>();
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_added', 'payment', rentPaymentId,
    `Added ${plan.targetAmount} on ${d.paid_date}`);

  for (const swept of plan.swept) {
    await c.env.DB.prepare(
      `INSERT INTO payment_entries (rent_payment_id, amount, paid_date, payment_method, receipt_no, notes, recorded_by, recorded_at, source_entry_id)
       VALUES (?,?,?,?,NULL,?,?,?,?)`
    ).bind(
      swept.rentPaymentId, swept.amount, d.paid_date, d.payment_method,
      `Auto-applied from overpayment recorded on ${d.paid_date}`, String(user.sub), now, entry!.id
    ).run();
    await recomputePaymentStatus(c.env.DB, swept.rentPaymentId);
    await auditLog(c.env.DB, user, 'payment.auto_applied', 'payment', swept.rentPaymentId,
      `Applied ${swept.amount} from overpayment on rent_payment #${rentPaymentId}`);
  }

  return c.json(entry, 201);
});

rentPayments.delete('/:id/entries/:entryId', async (c) => {
  const user = c.get('user');
  const rentPaymentId = Number(c.req.param('id'));
  const entryId = Number(c.req.param('entryId'));
  const result = await c.env.DB.prepare('DELETE FROM payment_entries WHERE id = ? AND rent_payment_id = ?')
    .bind(entryId, rentPaymentId).run();
  if (result.meta.changes === 0) return c.json({ error: 'Entry not found' }, 404);
  await recomputePaymentStatus(c.env.DB, rentPaymentId);
  await auditLog(c.env.DB, user, 'payment.entry_deleted', 'payment', rentPaymentId,
    `Deleted entry ${entryId}`);
  return c.json({ ok: true });
});

export default rentPayments;
