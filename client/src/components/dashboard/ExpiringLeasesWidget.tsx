import { formatDate, formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { leases: DashboardData['expiringLeases'] };

export function ExpiringLeasesWidget({ leases }: Props) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Expiring Leases (60 days)</h3>
      {leases.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No leases expiring soon</p>
      ) : (
        <div className="space-y-2">
          {leases.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{l.tenant_name}</p>
                <p className="text-xs text-muted-foreground">{l.unit_no} · {l.building_name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-yellow-600">{formatDate(l.end_date)}</p>
                <p className="text-xs text-muted-foreground">{formatAED(l.monthly_rent)}/mo</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
