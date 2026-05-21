import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { sponsors: DashboardData['expiringSponsors'] };

export function daysBadgeClass(days: number): string {
  if (days < 14)  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  if (days < 30)  return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
}

const STATUS_BADGE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};
const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', overdue: 'Overdue', pending: 'Pending',
};

export function ExpiringSponsorsWidget({ sponsors }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Expiring Sponsorships (90 days)</h3>
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
                  {s.payment_frequency} · {formatAED(s.expected_amount)}/yr
                </p>
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
