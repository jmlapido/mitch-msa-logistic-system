import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Archive, Receipt } from 'lucide-react';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { counts: DashboardData['actionCounts'] };

const CHIP_STYLES = {
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300',
  orange: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
} as const;

export function ActionStrip({ counts }: Props) {
  const navigate = useNavigate();
  const chips = [
    { count: counts.overdueRentCount, label: (n: number) => `${n} overdue rent payment${n !== 1 ? 's' : ''}`, icon: AlertTriangle, to: '/rentals/payments', style: CHIP_STYLES.red },
    { count: counts.expiringContractsCount, label: (n: number) => `${n} contract${n !== 1 ? 's' : ''} expiring ≤ 60 days`, icon: Clock, to: '/customers', style: CHIP_STYLES.amber },
    { count: counts.pendingArchiveCount, label: (n: number) => `${n} customer${n !== 1 ? 's' : ''} pending archive`, icon: Archive, to: '/customers', style: CHIP_STYLES.yellow },
    { count: counts.unpaidBillsCount, label: (n: number) => `${n} bill${n !== 1 ? 's' : ''} unpaid this month`, icon: Receipt, to: '/bills?status=unpaid', style: CHIP_STYLES.orange },
  ].filter(c => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(c => (
        <button
          key={c.to + c.label(c.count)}
          onClick={() => navigate(c.to)}
          className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs font-medium hover:opacity-80 transition-opacity ${c.style}`}
        >
          <c.icon size={13} /> {c.label(c.count)}
        </button>
      ))}
    </div>
  );
}
