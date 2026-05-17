import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import type { Env } from '../types';

const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use('*', requireAuth);

dashboard.get('/', async (c) => {
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);
  const db = c.env.DB;

  const billsStats = await db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_bills,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_paid,
      COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) as total_unpaid,
      MAX(amount) as highest_bill
    FROM bill_entries WHERE month = ?
  `).bind(month).first<{ total_bills: number; total_paid: number; total_unpaid: number; highest_bill: number }>();

  const rentStats = await db.prepare(`
    SELECT
      COALESCE(SUM(ROUND(c.annual_rent/12,2)), 0) as total_rent_due,
      COALESCE(SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as total_rent_collected
    FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.month = ?
  `).bind(month).first<{ total_rent_due: number; total_rent_collected: number }>();

  const overdueRent = await db.prepare(`
    SELECT COALESCE(SUM(ROUND(c.annual_rent/12,2)), 0) as overdue
    FROM contracts c
    WHERE date(c.end_date) >= date('now')
      AND date(c.start_date) <= ? || '-28'
      AND NOT EXISTS (
        SELECT 1 FROM rent_payments rp
        WHERE rp.contract_id = c.id AND rp.month = ? AND rp.status = 'collected'
      )
      AND date(? || '-05') < date('now')
  `).bind(month, month, month).first<{ overdue: number }>();

  const priorityRows = await db.prepare(`
    SELECT
      be.id as entry_id, be.amount, be.status,
      b.particulars, b.due_day,
      c.name as category_name, c.color as category_color, c.icon as category_icon,
      CASE
        WHEN be.status = 'paid' THEN 0
        WHEN b.due_day IS NOT NULL AND date(? || '-' || printf('%02d', b.due_day)) < date('now') THEN 1
        WHEN b.due_day IS NOT NULL AND date(? || '-' || printf('%02d', b.due_day)) <= date('now', '+7 days') THEN 2
        ELSE 3
      END as priority_rank
    FROM bill_entries be
    JOIN bills b ON be.bill_id = b.id
    JOIN categories c ON b.category_id = c.id
    WHERE be.month = ? AND be.status = 'unpaid'
    ORDER BY priority_rank ASC, be.amount DESC
    LIMIT 8
  `).bind(month, month, month).all();

  const upcomingRows = await db.prepare(`
    SELECT
      be.id as entry_id, be.amount, b.particulars, b.due_day,
      c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM bill_entries be
    JOIN bills b ON be.bill_id = b.id
    JOIN categories c ON b.category_id = c.id
    WHERE be.month = ? AND be.status = 'unpaid'
      AND (b.due_day IS NULL OR date(? || '-' || printf('%02d', b.due_day)) >= date('now'))
    ORDER BY b.due_day ASC NULLS LAST, be.amount DESC
    LIMIT 8
  `).bind(month, month).all();

  const rentByBuilding = await db.prepare(`
    SELECT
      b.id as building_id, b.name as building_name,
      COUNT(rp.id) as unit_count,
      COALESCE(SUM(ROUND(c.annual_rent/12,2)), 0) as expected,
      COALESCE(SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected
    FROM buildings b
    JOIN units u ON u.building_id = b.id
    JOIN tenants tn ON tn.unit_id = u.id
    JOIN contracts c ON c.tenant_id = tn.id AND date(c.end_date) >= date('now')
    LEFT JOIN rent_payments rp ON rp.contract_id = c.id AND rp.month = ?
    GROUP BY b.id ORDER BY b.name
  `).bind(month).all();

  const expiringLeases = await db.prepare(`
    SELECT c.id, c.end_date, ROUND(c.annual_rent/12,2) as monthly_rent,
      t.name as tenant_name, u.unit_no, b.name as building_name
    FROM contracts c
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    WHERE date(c.end_date) BETWEEN date('now') AND date('now', '+60 days')
    ORDER BY c.end_date
    LIMIT 8
  `).all();

  return c.json({
    month,
    bills: {
      total: billsStats?.total_bills ?? 0,
      paid: billsStats?.total_paid ?? 0,
      unpaid: billsStats?.total_unpaid ?? 0,
      highest: billsStats?.highest_bill ?? 0,
    },
    rent: {
      due: rentStats?.total_rent_due ?? 0,
      collected: rentStats?.total_rent_collected ?? 0,
      overdue: overdueRent?.overdue ?? 0,
    },
    priorityPayments: priorityRows.results,
    upcomingBills: upcomingRows.results,
    rentByBuilding: rentByBuilding.results,
    expiringLeases: expiringLeases.results,
  });
});

export default dashboard;
