import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';
import { STATUS_BADGE, STATUS_LABEL } from './sponsorBadges';

type Props = { sponsors: DashboardData['activeSponsors'] };

export function ActiveSponsorsWidget({ sponsors }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Active Sponsors</h3>
      {sponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No active sponsors</p>
      ) : (
        <div className="space-y-1">
          {sponsors.map(s => {
            const pct = s.expected_amount > 0 ? Math.round((s.total_paid / s.expected_amount) * 100) : 0;
            const showBar = s.status === 'partial' || s.status === 'overdue';
            const barColor = s.status === 'overdue' ? 'bg-red-500' : 'bg-blue-500';
            return (
              <div
                key={s.partner_id}
                className="group flex flex-col gap-1 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
                onClick={() => navigate(`/partners?partner=${s.partner_id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.company_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.payment_frequency}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[s.status] ?? ''}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    {!showBar && (
                      <span className="text-sm font-semibold">{formatAED(s.total_paid)}</span>
                    )}
                    <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
                  </div>
                </div>
                {showBar && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{formatAED(s.total_paid)} / {formatAED(s.expected_amount)}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
