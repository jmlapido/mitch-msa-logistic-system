import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt, CheckCircle, XCircle, Home, TrendingUp, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { StatCard } from '@/components/dashboard/StatCard';
import { RentBarChart } from '@/components/dashboard/RentBarChart';
import { BillsTrendChart } from '@/components/dashboard/BillsTrendChart';
import { RentTrendChart } from '@/components/dashboard/RentTrendChart';
import { SponsorshipStatCards } from '@/components/dashboard/SponsorshipStatCards';
import { ActionStrip } from '@/components/dashboard/ActionStrip';
import { PriorityPaymentsWidget } from '@/components/dashboard/PriorityPaymentsWidget';
import { ChequesDueWidget } from '@/components/dashboard/ChequesDueWidget';
import { TopBalancesWidget } from '@/components/dashboard/TopBalancesWidget';
import { ExpiringLeasesWidget } from '@/components/dashboard/ExpiringLeasesWidget';
import { ExpiringSponsorsWidget } from '@/components/dashboard/ExpiringSponsorsWidget';
import { BuildingOccupancyWidget } from '@/components/dashboard/BuildingOccupancyWidget';
import { currentMonth, monthLabel } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

function pctDelta(current: number, prev: number): string {
  if (prev === 0) return '—';
  const d = Math.round(((current - prev) / prev) * 100);
  return d >= 0 ? `▲ ${d}% vs prev` : `▼ ${Math.abs(d)}% vs prev`;
}
function pctDir(current: number, prev: number): 'up' | 'down' | 'neutral' {
  if (prev === 0) return 'neutral';
  return current >= prev ? 'up' : 'down';
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading } = useDashboard(month);
  const navigate = useNavigate();

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronLeft size={20} /></button>
          <span className="text-base font-semibold w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronRight size={20} /></button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="text-center py-12 text-muted-foreground">Loading dashboard…</div>
      ) : (
        <div className="space-y-6">

          <ActionStrip counts={data.actionCounts} monthName={monthLabel(month)} />

          {/* Bills & Rent stat cards */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-0.5">Bills &amp; Rent</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total Bills" value={<AedAmount amount={data.bills.total} />} icon={Receipt}
                delta={{ value: pctDelta(data.bills.total, data.prevMonth.bills.total), direction: pctDir(data.bills.total, data.prevMonth.bills.total) }}
                onClick={() => navigate('/bills')}
              />
              <StatCard
                label="Bills Paid" value={<AedAmount amount={data.bills.paid} />} icon={CheckCircle} color="green"
                delta={{ value: data.bills.total > 0 ? `▲ ${Math.round((data.bills.paid / data.bills.total) * 100)}% paid` : '—', direction: data.bills.paid > 0 ? 'up' : 'neutral' }}
                onClick={() => navigate('/bills?status=paid')}
              />
              <StatCard
                label="Bills Unpaid" value={<AedAmount amount={data.bills.unpaid} />} icon={XCircle} color="red"
                delta={{ value: pctDelta(data.bills.unpaid, data.prevMonth.bills.total - data.prevMonth.bills.paid), direction: data.bills.unpaid > 0 ? 'down' : 'neutral' }}
                onClick={() => navigate('/bills?status=unpaid')}
              />
              <StatCard
                label="Rent Due" value={<AedAmount amount={data.rent.due} />} icon={Home}
                onClick={() => navigate('/rentals/payments')}
              />
              <StatCard
                label="Rent Collected" value={<AedAmount amount={data.rent.collected} />} icon={TrendingUp} color="green"
                delta={{ value: data.rent.due > 0 ? `${Math.round((data.rent.collected / data.rent.due) * 100)}% collection rate` : '—', direction: pctDir(data.rent.collected, data.prevMonth.rent.collected) }}
                onClick={() => navigate('/rentals/payments')}
              />
              <StatCard
                label="Overdue Rent" value={<AedAmount amount={data.rent.overdue} />} icon={AlertTriangle}
                color={data.rent.overdue > 0 ? 'red' : 'default'}
                delta={{ value: data.rent.overdue > 0 ? '▼ needs collection' : '— all collected', direction: data.rent.overdue > 0 ? 'down' : 'neutral' }}
                onClick={() => navigate('/rentals/payments')}
              />
            </div>
          </div>

          {/* Sponsorship stat cards */}
          <SponsorshipStatCards sponsorships={data.sponsorships} />

          {/* Charts row */}
          <RentBarChart buildings={data.rentByBuilding} />

          {/* Trend charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <BillsTrendChart history={data.billsHistory} />
            <RentTrendChart history={data.rentHistory} />
          </div>

          {/* Widget row 1 — Bills & Rent */}
          <div className="grid gap-4 md:grid-cols-3">
            <PriorityPaymentsWidget items={data.priorityPayments} month={month} />
            <TopBalancesWidget balances={data.topBalances} />
            <ExpiringLeasesWidget leases={data.expiringLeases} />
          </div>

          {/* Widget row 2 — Rentals & Sponsorships */}
          <div className="grid gap-4 md:grid-cols-3">
            <BuildingOccupancyWidget buildings={data.buildingOccupancy} />
            <ChequesDueWidget cheques={data.chequesDue} />
            <ExpiringSponsorsWidget sponsors={data.expiringSponsors} />
          </div>

        </div>
      )}
    </div>
  );
}
