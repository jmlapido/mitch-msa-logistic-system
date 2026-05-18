import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const rentPayments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
rentPayments.use('*', requireAuth);

rentPayments.get('/', async (c) => {
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);
  const buildingId = c.req.query('building_id');

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO rent_payments (contract_id, month, amount, status)
    SELECT c.id, ?, ROUND(c.annual_rent / 12, 2), 'pending'
    FROM contracts c
    WHERE date(c.start_date) <= ? || '-28'
      AND date(c.end_date) >= ? || '-01'
  `).bind(month, month, month).run();

  let query = `
    SELECT rp.*, ROUND(c.annual_rent / 12, 2) as expected_rent,
      t.name as tenant_name, t.phone as tenant_phone,
      u.unit_no, u.type as unit_type,
      b.id as building_id, b.name as building_name,
      c.payment_type,
      CASE
        WHEN c.payment_type = 'cash' THEN
          rp.month || '-' || printf('%02d', COALESCE(c.due_day, 1))
        WHEN c.payment_type = 'pdc' THEN
          pc.cheque_date
        ELSE NULL
      END as due_date,
      (SELECT COALESCE(SUM(rp2.amount), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status != 'collected'
         AND rp2.month < ?) as tenant_overdue,
      (SELECT COALESCE(SUM(rp2.amount), 0)
       FROM rent_payments rp2
       JOIN contracts c2 ON rp2.contract_id = c2.id
       WHERE c2.tenant_id = t.id
         AND rp2.status != 'collected') as tenant_balance
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    LEFT JOIN pdc_cheques pc ON pc.contract_id = c.id
      AND pc.pdc_number = MIN(
        c.no_of_pdc,
        MAX(1, (CAST(strftime('%Y', rp.month) AS INTEGER) * 12 + CAST(strftime('%m', rp.month) AS INTEGER))
             - (CAST(strftime('%Y', c.start_date) AS INTEGER) * 12 + CAST(strftime('%m', c.start_date) AS INTEGER)) + 1)
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
  amount: z.number().positive().optional(),
  status: z.enum(['collected', 'pending', 'overdue']).optional(),
  paid_date: z.string().nullable().optional(),
  receipt_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

rentPayments.put('/:id', zValidator('json', updatePaymentSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const now = new Date().toISOString();
  const entries = [...Object.entries(d), ['recorded_by', user.sub], ['recorded_at', now]];
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE rent_payments SET ${fields} WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM rent_payments WHERE id = ?').bind(id).first());
});

export default rentPayments;
