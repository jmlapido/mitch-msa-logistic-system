import { useNavigate } from 'react-router-dom';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';
import { STATUS_BADGE, STATUS_LABEL } from './sponsorBadges';
import { formatDate } from '@/lib/utils';

type Props = { sponsors: DashboardData['expiringSponsors'] };

export function daysBadgeClass(days: number): string {
  if (days < 14) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  if (days < 30) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
}

export function ExpiringSponsorsWidget({ sponsors }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Expiring Sponsorships (60 days)</h3>
      {sponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No contracts expiring soon</p>
      ) : (
        <div className="space-y-1">
          {sponsors.map(s => (
            <div
              key={s.partner_id}
              className="group flex items-center justify-between gap-2 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
              onClick={() => navigate(`/partners?partner=${s.partner_id}`)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.company_name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {s.payment_frequency} · <AedAmount amount={s.expected_amount} />/yr
                </p>
                <p className="text-xs text-muted-foreground">Expires {formatDate(s.end_date)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[s.status] ?? ''}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${daysBadgeClass(s.days_remaining)}`}>
                  {s.days_remaining}d
                </span>
                <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
