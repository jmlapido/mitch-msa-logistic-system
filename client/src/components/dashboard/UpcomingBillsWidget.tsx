import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

function ordinal(n: number): string {
  if (n === 11 || n === 12 || n === 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

type Props = { items: DashboardData['upcomingBills']; month: string };

export function UpcomingBillsWidget({ items, month: _month }: Props) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Upcoming This Month</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No upcoming bills</p>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div
              key={item.entry_id}
              className="group flex items-center justify-between gap-2 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
              onClick={() => navigate(`/bills?highlight=${item.entry_id}`)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">{item.category_icon}</span>
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.particulars}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {item.due_day && <span className="text-xs text-muted-foreground">{ordinal(item.due_day)}</span>}
                <span className="text-sm font-semibold">{formatAED(item.amount)}</span>
                <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
