import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { items: DashboardData['upcomingBills']; month: string };

export function UpcomingBillsWidget({ items, month: _month }: Props) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Upcoming This Month</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No upcoming bills</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.entry_id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm">{item.category_icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.particulars}</p>
                  {item.property_name && <p className="text-xs text-muted-foreground truncate">{item.property_name}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {item.due_day && <span className="text-xs text-muted-foreground">{item.due_day}th</span>}
                <span className="text-sm font-semibold">{formatAED(item.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
