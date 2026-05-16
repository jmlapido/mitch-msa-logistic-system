import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt, CheckCircle, XCircle, TrendingUp, Home, AlertTriangle } from 'lucide-react';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { StatCard } from '@/components/dashboard/StatCard';
import { PriorityPaymentsWidget } from '@/components/dashboard/PriorityPaymentsWidget';
import { UpcomingBillsWidget } from '@/components/dashboard/UpcomingBillsWidget';
import { RentSummaryWidget } from '@/components/dashboard/RentSummaryWidget';
import { ExpiringLeasesWidget } from '@/components/dashboard/ExpiringLeasesWidget';
import { currentMonth, monthLabel, formatAED } from '@/lib/utils';

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading } = useDashboard(month);

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="p-1 hover:text-primary"><ChevronLeft size={18} /></button>
          <span className="text-sm font-medium w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="p-1 hover:text-primary"><ChevronRight size={18} /></button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="text-center py-12 text-muted-foreground">Loading dashboard…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Bills" value={formatAED(data.bills.total)} icon={Receipt} />
            <StatCard label="Bills Paid" value={formatAED(data.bills.paid)} icon={CheckCircle} color="green" />
            <StatCard label="Bills Unpaid" value={formatAED(data.bills.unpaid)} icon={XCircle} color="red" />
            <StatCard label="Rent Due" value={formatAED(data.rent.due)} icon={Home} />
            <StatCard label="Rent Collected" value={formatAED(data.rent.collected)} icon={TrendingUp} color="green" />
            <StatCard label="Overdue Rent" value={formatAED(data.rent.overdue)} icon={AlertTriangle} color={data.rent.overdue > 0 ? 'red' : 'default'} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <PriorityPaymentsWidget items={data.priorityPayments} />
            <UpcomingBillsWidget items={data.upcomingBills} month={month} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <RentSummaryWidget buildings={data.rentByBuilding} />
            <ExpiringLeasesWidget leases={data.expiringLeases} />
          </div>
        </div>
      )}
    </div>
  );
}
