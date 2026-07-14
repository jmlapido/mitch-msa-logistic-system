import { useNavigate } from 'react-router-dom';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { leases: DashboardData['expiringLeases'] };

function daysBadgeClass(days: number): string {
  if (days < 14) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  if (days < 30) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
}

export function ExpiringLeasesWidget({ leases }: Props) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border rounded-lg p-4 min-w-0 overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Expiring Leases (60 days)</h3>
      {leases.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No leases expiring soon</p>
      ) : (
        <div className="space-y-1">
          {leases.map(l => {
            const days = Math.ceil((new Date(l.end_date).getTime() - Date.now()) / 86400000);
            return (
              <div
                key={l.id}
                className="group flex items-center justify-between gap-2 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
                onClick={() => navigate(`/customers?id=${l.tenant_id}`)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{l.tenant_name}</p>
                  <p className="text-xs text-muted-foreground">{l.unit_no} · {l.building_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${daysBadgeClass(days)}`}>
                    {days}d
                  </span>
                  <span className="text-xs text-muted-foreground"><AedAmount amount={l.monthly_rent} />/mo</span>
                  <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
