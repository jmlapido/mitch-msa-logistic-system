import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const reports = new Hono<{ Bindings: Env }>();
reports.use('*', requireAuth, requireAdmin);

// GET /api/reports?type=bills|rental|combined&from=YYYY-MM&to=YYYY-MM&building_id=N&category_id=N
reports.get('/', async (c) => {
  const type = c.req.query('type') ?? 'bills';
  const from = c.req.query('from') ?? new Date().toISOString().slice(0, 7);
  const to = c.req.query('to') ?? from;
  const buildingId = c.req.query('building_id') ? Number(c.req.query('building_id')) : null;
  const categoryId = c.req.query('category_id') ? Number(c.req.query('category_id')) : null;
  const db = c.env.DB;

  if (type === 'bills' || type === 'combined') {
    let billsQuery = `
      SELECT
        be.month,
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

    const { results: rentMonthly } = await db.prepare(`
      SELECT rp.month,
        SUM(ROUND(c.annual_rent/12,2)) as expected,
        SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as collected
      FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
      WHERE rp.month BETWEEN ? AND ?
      GROUP BY rp.month ORDER BY rp.month
    `).bind(from, to).all();

    return c.json({ type, from, to, billRows, monthSummary, catSummary, rentMonthly });
  }

  if (type === 'rental') {
    let rentQuery = `
      SELECT rp.month, rp.amount, rp.status, rp.paid_date, rp.receipt_no,
        t.name as tenant_name, u.unit_no, u.type as unit_type,
        b.id as building_id, b.name as building_name, ROUND(c.annual_rent/12,2) as expected_rent
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
        COUNT(DISTINCT u.id) as unit_count,
        SUM(ROUND(c.annual_rent/12,2)) as total_expected,
        SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as total_collected
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

  return c.json({ error: 'Invalid report type' }, 400);
});

export default reports;
