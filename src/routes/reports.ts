import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const reports = new Hono<{ Bindings: Env }>();
reports.use('*', requireAuth, requireAdmin);

const EXPECTED_RENT = `CASE
  WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
  WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
  WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
  WHEN c.payment_frequency = 'custom'      THEN
    ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
  ELSE ROUND(c.annual_rent / 12.0, 2)
END`;

// GET /api/reports?type=bills|rental|combined|outstanding|expiring&from=YYYY-MM&to=YYYY-MM&building_id=N
reports.get('/', async (c) => {
  const type = c.req.query('type') ?? 'bills';
  const from = c.req.query('from') ?? new Date().toISOString().slice(0, 7);
  const to = c.req.query('to') ?? from;
  const buildingId = c.req.query('building_id') ? Number(c.req.query('building_id')) : null;
  const categoryId = c.req.query('category_id') ? Number(c.req.query('category_id')) : null;
  const db = c.env.DB;

  // ── Bills ────────────────────────────────────────────────────────────────
  if (type === 'bills' || type === 'combined') {
    let billsQuery = `
      SELECT be.month,
        c.name as category_name, c.color as category_color, c.icon as category_icon,
        b.particulars, b.account_no,
        be.amount, be.status, be.paid_date, be.invoice_no,
        bld.name as building_name
      FROM bill_entries be
      JOIN bills b ON be.bill_id = b.id
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN buildings bld ON b.building_id = bld.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const binds: unknown[] = [from, to];
    if (buildingId) { billsQuery += ' AND b.building_id = ?'; binds.push(buildingId); }
    if (categoryId) { billsQuery += ' AND c.id = ?'; binds.push(categoryId); }
    billsQuery += ' ORDER BY be.month, c.sort_order, b.particulars';
    const { results: billRows } = await db.prepare(billsQuery).bind(...binds).all();

    let monthQuery = `
      SELECT be.month,
        SUM(be.amount) as total,
        SUM(CASE WHEN be.status = 'paid' THEN be.amount ELSE 0 END) as paid,
        SUM(CASE WHEN be.status = 'unpaid' THEN be.amount ELSE 0 END) as unpaid
      FROM bill_entries be JOIN bills b ON be.bill_id = b.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const monthBinds: unknown[] = [from, to];
    if (buildingId) { monthQuery += ' AND b.building_id = ?'; monthBinds.push(buildingId); }
    monthQuery += ' GROUP BY be.month ORDER BY be.month';
    const { results: monthSummary } = await db.prepare(monthQuery).bind(...monthBinds).all();

    let catQuery = `
      SELECT c.name, c.color, c.icon,
        SUM(be.amount) as total,
        SUM(CASE WHEN be.status = 'paid' THEN be.amount ELSE 0 END) as paid
      FROM bill_entries be JOIN bills b ON be.bill_id = b.id JOIN categories c ON b.category_id = c.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const catBinds: unknown[] = [from, to];
    if (buildingId) { catQuery += ' AND b.building_id = ?'; catBinds.push(buildingId); }
    catQuery += ' GROUP BY c.id ORDER BY total DESC';
    const { results: catSummary } = await db.prepare(catQuery).bind(...catBinds).all();

    if (type === 'bills') {
      return c.json({ type, from, to, rows: billRows, monthSummary, catSummary });
    }

    // Combined — rent side (fixed: use amount_paid, payment_frequency-aware expected)
    const { results: rentMonthly } = await db.prepare(`
      SELECT rp.month,
        SUM(${EXPECTED_RENT}) as expected,
        SUM(rp.amount_paid) as collected
      FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
      WHERE rp.month BETWEEN ? AND ?
      GROUP BY rp.month ORDER BY rp.month
    `).bind(from, to).all();

    return c.json({ type, from, to, billRows, monthSummary, catSummary, rentMonthly });
  }

  // ── Rental Collection ────────────────────────────────────────────────────
  if (type === 'rental') {
    let rentQuery = `
      SELECT rp.month, rp.amount_paid, rp.status, rp.paid_date, rp.receipt_no,
        t.name as tenant_name, u.unit_no,
        b.id as building_id, b.name as building_name,
        ${EXPECTED_RENT} as expected_rent
      FROM rent_payments rp
      JOIN contracts c ON rp.contract_id = c.id
      JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE rp.month BETWEEN ? AND ?
    `;
    const binds: unknown[] = [from, to];
    if (buildingId) { rentQuery += ' AND b.id = ?'; binds.push(buildingId); }
    rentQuery += ' ORDER BY rp.month, b.name, u.unit_no';
    const { results: rentRows } = await db.prepare(rentQuery).bind(...binds).all();

    const { results: buildingSummary } = await db.prepare(`
      SELECT b.name as building_name,
        COUNT(DISTINCT rp.id) as unit_count,
        SUM(${EXPECTED_RENT}) as total_expected,
        SUM(rp.amount_paid) as total_collected,
        COUNT(CASE WHEN rp.status = 'collected' THEN 1 END) as count_collected,
        COUNT(CASE WHEN rp.status = 'partial' THEN 1 END) as count_partial,
        COUNT(CASE WHEN rp.status IN ('overdue','pending') THEN 1 END) as count_unpaid
      FROM rent_payments rp
      JOIN contracts c ON rp.contract_id = c.id
      JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE rp.month BETWEEN ? AND ?
      GROUP BY b.id ORDER BY b.name
    `).bind(from, to).all();

    return c.json({ type, from, to, rows: rentRows, buildingSummary });
  }

  // ── Outstanding Balances ─────────────────────────────────────────────────
  if (type === 'outstanding') {
    const { results: rows } = await db.prepare(`
      SELECT
        t.name as tenant_name, u.unit_no, b.name as building_name,
        rp.month, rp.status, rp.amount_paid,
        ${EXPECTED_RENT} as expected_rent,
        (${EXPECTED_RENT} - rp.amount_paid) as balance
      FROM rent_payments rp
      JOIN contracts c ON rp.contract_id = c.id
      JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE rp.status IN ('overdue', 'partial')
        AND t.status = 'active'
      ORDER BY t.name, rp.month
    `).all();

    const { results: tenantSummary } = await db.prepare(`
      SELECT
        t.name as tenant_name, u.unit_no, b.name as building_name,
        COUNT(rp.id) as months_overdue,
        SUM(CASE WHEN rp.status = 'partial'
          THEN ${EXPECTED_RENT} - rp.amount_paid
          ELSE ${EXPECTED_RENT}
        END) as total_balance
      FROM rent_payments rp
      JOIN contracts c ON rp.contract_id = c.id
      JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE rp.status IN ('overdue', 'partial')
        AND t.status = 'active'
      GROUP BY t.id ORDER BY total_balance DESC
    `).all();

    return c.json({ type, rows, tenantSummary });
  }

  // ── Expiring Leases ───────────────────────────────────────────────────────
  if (type === 'expiring') {
    const fromDate = from + '-01';
    const toDate = to + '-28';
    const { results: rows } = await db.prepare(`
      SELECT
        t.name as tenant_name, u.unit_no, b.name as building_name,
        c.end_date, c.annual_rent, c.payment_frequency,
        ROUND(c.annual_rent/12, 2) as monthly_rent,
        CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_left
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN buildings b ON u.building_id = b.id
      WHERE date(c.end_date) BETWEEN ? AND ?
        AND t.status = 'active'
      ORDER BY c.end_date ASC
    `).bind(fromDate, toDate).all();

    return c.json({ type, from, to, rows });
  }

  // ── Partners Report ───────────────────────────────────────────────────────
  if (type === 'partners') {
    const fromDate = from + '-01';
    const toDate = to + '-31';

    const { results: rows } = await db.prepare(`
      SELECT
        p.company_name,
        pc.id as contract_id,
        pc.start_date,
        pc.end_date,
        pc.expected_amount,
        pc.payment_frequency,
        COALESCE(SUM(pp.amount), 0) as total_paid,
        pc.expected_amount - COALESCE(SUM(pp.amount), 0) as balance,
        CASE
          WHEN COALESCE(SUM(pp.amount), 0) >= pc.expected_amount THEN 'paid'
          WHEN date(pc.end_date) < date('now') AND COALESCE(SUM(pp.amount), 0) < pc.expected_amount THEN 'overdue'
          WHEN COALESCE(SUM(pp.amount), 0) > 0 THEN 'partial'
          ELSE 'pending'
        END as status
      FROM partner_contracts pc
      JOIN partners p ON pc.partner_id = p.id
      LEFT JOIN partner_payments pp ON pp.contract_id = pc.id
        AND pp.paid_date BETWEEN ? AND ?
      WHERE pc.start_date <= ? AND pc.end_date >= ?
      GROUP BY pc.id
      ORDER BY p.company_name, pc.end_date DESC
    `).bind(fromDate, toDate, toDate, fromDate).all();

    const { results: payments } = await db.prepare(`
      SELECT
        p.company_name,
        pp.amount,
        pp.paid_date,
        pp.payment_method,
        pp.receipt_no,
        pp.notes
      FROM partner_payments pp
      JOIN partners p ON pp.partner_id = p.id
      WHERE pp.paid_date BETWEEN ? AND ?
      ORDER BY pp.paid_date DESC, p.company_name
    `).bind(fromDate, toDate).all();

    return c.json({ type, from, to, rows, payments });
  }

  return c.json({ error: 'Invalid report type' }, 400);
});

export default reports;
