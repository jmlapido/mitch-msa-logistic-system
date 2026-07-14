import { useNavigate } from 'react-router-dom';
import { AedAmount } from '@/components/ui/AedAmount';
import { formatDate } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { cheques: DashboardData['chequesDue'] };

export function ChequesDueWidget({ cheques }: Props) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Cheques Due (30 days)</h3>
      {cheques.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No cheques due soon</p>
      ) : (
        <div className="space-y-1">
          {cheques.map(ch => (
            <div
              key={`${ch.tenant_id}-${ch.pdc_number}-${ch.cheque_date}`}
              className="group flex items-center justify-between gap-2 py-2 px-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
              onClick={() => navigate(`/customers?id=${ch.tenant_id}`)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate capitalize group-hover:text-primary transition-colors">{ch.tenant_name}</p>
                <p className="text-xs text-muted-foreground">Cheque #{ch.pdc_number} · {formatDate(ch.cheque_date)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ch.amount != null && <span className="text-xs font-semibold"><AedAmount amount={ch.amount} /></span>}
                <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs">›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
