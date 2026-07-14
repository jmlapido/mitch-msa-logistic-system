import { useNavigate } from 'react-router-dom';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { balances: DashboardData['topBalances'] };

export function TopBalancesWidget({ balances }: Props) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Top Outstanding Balances</h3>
      {balances.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No outstanding balances</p>
      ) : (
        <div className="space-y-1">
          {balances.map(b => (
            <div
              key={b.id}
              className="group flex items-center justify-between gap-2 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
              onClick={() => navigate(`/customers?id=${b.id}`)}
            >
              <p className="text-sm font-medium truncate capitalize group-hover:text-primary transition-colors">{b.name}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400"><AedAmount amount={b.total_balance} /></span>
                <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
