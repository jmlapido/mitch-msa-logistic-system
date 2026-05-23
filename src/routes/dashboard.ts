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
      COALESCE(SUM(CASE
        WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
        WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
        WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
        WHEN c.payment_frequency = 'custom'      THEN
          ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(c.annual_rent / 12.0, 2)
      END), 0) as total_rent_due,
      COALESCE(SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as total_rent_collected
    FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.month = ?
  `).bind(month).first<{ total_rent_due: number; total_rent_collected: number }>();

  const overdueRent = await db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
      WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
      WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
      WHEN c.payment_frequency = 'custom'      THEN
        ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
      ELSE ROUND(c.annual_rent / 12.0, 2)
    END), 0) as overdue
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
      COALESCE(SUM(CASE
        WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
        WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
        WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
        WHEN c.payment_frequency = 'custom'      THEN
          ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(c.annual_rent / 12.0, 2)
      END), 0) as expected,
      COALESCE(SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected
    FROM buildings b
    JOIN units u ON u.building_id = b.id
    JOIN tenants tn ON tn.unit_id = u.id
    JOIN contracts c ON c.tenant_id = tn.id AND date(c.end_date) >= date('now')
    LEFT JOIN rent_payments rp ON rp.contract_id = c.id AND rp.month = ?
    GROUP BY b.id ORDER BY b.name
  `).bind(month).all();

  const buildingOccupancy = await db.prepare(`
    SELECT b.id as building_id, b.name as building_name, b.type,
      COUNT(u.id) as total_units,
      SUM(CASE WHEN (
        EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id AND l.status = 'active')
        OR EXISTS (SELECT 1 FROM tenants t WHERE t.unit_id = u.id)
      ) THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN NOT (
        EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id AND l.status = 'active')
        OR EXISTS (SELECT 1 FROM tenants t WHERE t.unit_id = u.id)
      ) THEN 1 ELSE 0 END) as vacant
    FROM buildings b
    LEFT JOIN units u ON u.building_id = b.id
    WHERE b.name != 'MSA Office'
    GROUP BY b.id
    ORDER BY b.name
  `).all<{ building_id: number; building_name: string; type: string; total_units: number; occupied: number; vacant: number }>();

  const expiringLeases = await db.prepare(`
    SELECT c.id, t.id as tenant_id, c.end_date, ROUND(c.annual_rent/12,2) as monthly_rent,
      t.name as tenant_name, u.unit_no, b.name as building_name
    FROM contracts c
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN units u ON t.unit_id = u.id
    LEFT JOIN buildings b ON u.building_id = b.id
    WHERE date(c.end_date) BETWEEN date('now') AND date('now', '+60 days')
    ORDER BY c.end_date
    LIMIT 8
  `).all();

  // compute previous month string  e.g. "2026-04" when month="2026-05"
  const [y, mo] = month.split('-').map(Number) as [number, number];
  const prevDate = new Date(y, mo - 2);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const prevBillStats = await db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_bills,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_paid
    FROM bill_entries WHERE month = ?
  `).bind(prevMonth).first<{ total_bills: number; total_paid: number }>();

  const prevRentStats = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN c.payment_frequency = 'annual'      THEN c.annual_rent
        WHEN c.payment_frequency = 'quarterly'   THEN ROUND(c.annual_rent / 4.0, 2)
        WHEN c.payment_frequency = 'semi-annual' THEN ROUND(c.annual_rent / 2.0, 2)
        WHEN c.payment_frequency = 'custom'      THEN
          ROUND(c.annual_rent / MAX(1, (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = c.id AND cheque_date IS NOT NULL)), 2)
        ELSE ROUND(c.annual_rent / 12.0, 2)
      END), 0) as total_rent_due,
      COALESCE(SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as total_rent_collected
    FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.month = ?
  `).bind(prevMonth).first<{ total_rent_due: number; total_rent_collected: number }>();

  const billsHistory = await db.prepare(`
    SELECT month,
      COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) as unpaid
    FROM bill_entries
    WHERE month >= strftime('%Y-%m', date(? || '-01', '-5 months'))
    GROUP BY month
    ORDER BY month
  `).bind(month).all<{ month: string; total: number; unpaid: number }>();

  const rentHistory = await db.prepare(`
    SELECT rp.month,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'monthly' OR c.payment_frequency IS NULL
                        THEN ROUND(c.annual_rent / 12.0, 2) ELSE 0 END), 0) as due_monthly,
      COALESCE(SUM(CASE WHEN (c.payment_frequency = 'monthly' OR c.payment_frequency IS NULL)
                        AND rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected_monthly,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'annual' THEN c.annual_rent ELSE 0 END), 0) as due_annual,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'annual'
                        AND rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected_annual,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'quarterly'
                        THEN ROUND(c.annual_rent / 4.0, 2) ELSE 0 END), 0) as due_quarterly,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'quarterly'
                        AND rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected_quarterly,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'semi-annual'
                        THEN ROUND(c.annual_rent / 2.0, 2) ELSE 0 END), 0) as due_semi_annual,
      COALESCE(SUM(CASE WHEN c.payment_frequency = 'semi-annual'
                        AND rp.status = 'collected' THEN rp.amount ELSE 0 END), 0) as collected_semi_annual
    FROM rent_payments rp
    JOIN contracts c ON rp.contract_id = c.id
    WHERE rp.month >= strftime('%Y-%m', date(? || '-01', '-5 months'))
    GROUP BY rp.month
    ORDER BY rp.month
  `).bind(month).all<{ month: string; due_monthly: number; collected_monthly: number; due_annual: number; collected_annual: number; due_quarterly: number; collected_quarterly: number; due_semi_annual: number; collected_semi_annual: number }>();

  const sponsorshipSummary = await db.prepare(`
    SELECT
      COUNT(DISTINCT p.id) as active_sponsors,
      COALESCE(SUM(pc.expected_amount), 0) as total_contract_value,
      COALESCE(SUM(pp_totals.total_paid), 0) as total_collected,
      COALESCE(SUM(
        CASE WHEN date(pc.end_date) < date('now')
                  AND COALESCE(pp_totals.total_paid, 0) < pc.expected_amount
             THEN pc.expected_amount - COALESCE(pp_totals.total_paid, 0)
             ELSE 0 END
      ), 0) as total_overdue
    FROM partners p
    JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
    LEFT JOIN (
      SELECT contract_id, SUM(amount) as total_paid
      FROM partner_payments GROUP BY contract_id
    ) pp_totals ON pp_totals.contract_id = pc.id
    WHERE p.is_archived = 0
  `).first<{ active_sponsors: number; total_contract_value: number; total_collected: number; total_overdue: number }>();

  const activeSponsors = await db.prepare(`
    SELECT p.id as partner_id, p.company_name,
      pc.id as contract_id, pc.expected_amount, pc.payment_frequency,
      pc.end_date as contract_end,
      COALESCE(pp.total_paid, 0) as total_paid,
      CASE
        WHEN COALESCE(pp.total_paid, 0) >= pc.expected_amount THEN 'paid'
        WHEN date(pc.end_date) < date('now') AND COALESCE(pp.total_paid, 0) < pc.expected_amount THEN 'overdue'
        WHEN COALESCE(pp.total_paid, 0) > 0 THEN 'partial'
        ELSE 'pending'
      END as status
    FROM partners p
    JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
    LEFT JOIN (
      SELECT contract_id, SUM(amount) as total_paid
      FROM partner_payments GROUP BY contract_id
    ) pp ON pp.contract_id = pc.id
    WHERE p.is_archived = 0
    ORDER BY p.company_name
    LIMIT 8
  `).all<{ partner_id: number; company_name: string; contract_id: number; expected_amount: number; payment_frequency: string; contract_end: string; total_paid: number; status: string }>();

  const expiringSponsors = await db.prepare(`
    SELECT p.id as partner_id, p.company_name,
      pc.end_date, pc.expected_amount, pc.payment_frequency,
      COALESCE(pp.total_paid, 0) as total_paid,
      CAST(julianday(pc.end_date) - julianday('now') AS INTEGER) as days_remaining,
      CASE
        WHEN COALESCE(pp.total_paid, 0) >= pc.expected_amount THEN 'paid'
        WHEN date(pc.end_date) < date('now') AND COALESCE(pp.total_paid, 0) < pc.expected_amount THEN 'overdue'
        WHEN COALESCE(pp.total_paid, 0) > 0 THEN 'partial'
        ELSE 'pending'
      END as status
    FROM partners p
    JOIN partner_contracts pc ON pc.partner_id = p.id AND pc.status = 'active'
    LEFT JOIN (
      SELECT contract_id, SUM(amount) as total_paid
      FROM partner_payments GROUP BY contract_id
    ) pp ON pp.contract_id = pc.id
    WHERE date(pc.end_date) BETWEEN date('now') AND date('now', '+60 days')
      AND p.is_archived = 0
    ORDER BY pc.end_date
    LIMIT 8
  `).all<{ partner_id: number; company_name: string; end_date: string; expected_amount: number; payment_frequency: string; total_paid: number; days_remaining: number; status: string }>();

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
    prevMonth: {
      bills: {
        total: prevBillStats?.total_bills ?? 0,
        paid: prevBillStats?.total_paid ?? 0,
      },
      rent: { collected: prevRentStats?.total_rent_collected ?? 0 },
    },
    billsHistory: billsHistory.results,
    rentHistory: rentHistory.results,
    sponsorships: {
      totalContractValue: sponsorshipSummary?.total_contract_value ?? 0,
      collected: sponsorshipSummary?.total_collected ?? 0,
      pending: Math.max(0, (sponsorshipSummary?.total_contract_value ?? 0) - (sponsorshipSummary?.total_collected ?? 0) - (sponsorshipSummary?.total_overdue ?? 0)),
      overdue: sponsorshipSummary?.total_overdue ?? 0,
      activeCount: sponsorshipSummary?.active_sponsors ?? 0,
    },
    activeSponsors: activeSponsors.results,
    expiringSponsors: expiringSponsors.results,
    priorityPayments: priorityRows.results,
    upcomingBills: upcomingRows.results,
    rentByBuilding: rentByBuilding.results,
    expiringLeases: expiringLeases.results,
    buildingOccupancy: buildingOccupancy.results,
  });
});

export default dashboard;
