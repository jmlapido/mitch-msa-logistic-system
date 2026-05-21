import { PrintHeader } from './PrintHeader';
import { monthLabel, formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

type Row = {
  tenant_name: string; unit_no: string; building_name: string;
  end_date: string; annual_rent: number; payment_frequency: string | null;
  monthly_rent: number; days_left: number;
};

type Props = { rows: Row[]; from: string; to: string };

function urgency(days: number): { cls: string; label: string } {
  if (days < 0)  return { cls: 'text-red-700 font-bold',    label: 'Expired' };
  if (days <= 30) return { cls: 'text-red-600 font-semibold', label: `${days}d left` };
  if (days <= 60) return { cls: 'text-orange-500 font-medium', label: `${days}d left` };
  return { cls: 'text-yellow-600', label: `${days}d left` };
}

export function ExpiringLeasesReportView({ rows, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;

  return (
    <div>
      <PrintHeader title="Expiring Leases Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Expiring Leases</h2>
        <p className="text-sm text-muted-foreground">Contracts whose end date falls within {subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No leases expiring in this period.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Expired', count: rows.filter(r => r.days_left < 0).length, cls: 'text-red-600' },
              { label: 'Expiring ≤ 30 days', count: rows.filter(r => r.days_left >= 0 && r.days_left <= 30).length, cls: 'text-orange-500' },
              { label: 'Expiring 31–90 days', count: rows.filter(r => r.days_left > 30).length, cls: 'text-yellow-600' },
            ].map(c => (
              <div key={c.label} className="bg-card border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold ${c.cls}`}>{c.count}</p>
              </div>
            ))}
          </div>

          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="text-left px-3 py-2">Tenant</th>
                <th className="text-left px-3 py-2">Unit</th>
                <th className="text-left px-3 py-2">Building</th>
                <th className="text-center px-3 py-2">Lease End</th>
                <th className="text-center px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Rent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => {
                const u = urgency(r.days_left);
                const isAnnual = r.payment_frequency === 'annual';
                return (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{r.tenant_name}</td>
                    <td className="px-3 py-1.5">{r.unit_no ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.building_name ?? '—'}</td>
                    <td className="px-3 py-1.5 text-center">{formatDate(r.end_date)}</td>
                    <td className="px-3 py-1.5 text-center"><span className={u.cls}>{u.label}</span></td>
                    <td className="px-3 py-1.5 text-right text-xs">
                      {isAnnual
                        ? <>{<AedAmount amount={r.annual_rent} />}<span className="text-muted-foreground">/yr</span></>
                        : <>{<AedAmount amount={r.monthly_rent} />}<span className="text-muted-foreground">/mo</span></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
