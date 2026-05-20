import { PrintHeader } from './PrintHeader';
import { formatAED, monthLabel } from '@/lib/utils';

type Row = {
  tenant_name: string; unit_no: string; building_name: string;
  month: string; status: string; expected_rent: number; amount_paid: number; balance: number;
};
type TenantSummary = {
  tenant_name: string; unit_no: string; building_name: string;
  months_overdue: number; total_balance: number;
};

type Props = { rows: Row[]; tenantSummary: TenantSummary[] };

export function OutstandingReportView({ rows, tenantSummary }: Props) {
  const grandTotal = tenantSummary.reduce((s, t) => s + t.total_balance, 0);

  return (
    <div>
      <PrintHeader title="Outstanding Balances Report" subtitle="All unpaid & partial payments" />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Outstanding Balances</h2>
        <p className="text-sm text-muted-foreground">All unpaid and partially paid rent across all months</p>
      </div>

      {tenantSummary.length === 0 ? (
        <div className="text-center py-12 text-green-600 font-medium">No outstanding balances — all rent is settled.</div>
      ) : (
        <>
          {/* Grand total banner */}
          <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-red-800 dark:text-red-200">Total Outstanding Balance</span>
            <span className="text-lg font-bold text-red-600">{formatAED(grandTotal)}</span>
          </div>

          {/* Per-tenant summary */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">By Tenant</h3>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Tenant</th>
                  <th className="text-left px-3 py-2">Unit</th>
                  <th className="text-left px-3 py-2">Building</th>
                  <th className="text-right px-3 py-2">Months Overdue</th>
                  <th className="text-right px-3 py-2">Total Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenantSummary.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{t.tenant_name}</td>
                    <td className="px-3 py-1.5">{t.unit_no ?? '—'}</td>
                    <td className="px-3 py-1.5">{t.building_name ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-red-600 font-medium">{t.months_overdue}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-red-600">
                      {formatAED(t.total_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Month-by-month detail */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Detail by Month</h3>
            <table className="w-full text-xs border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Tenant</th>
                  <th className="text-left px-3 py-2">Unit</th>
                  <th className="text-left px-3 py-2">Building</th>
                  <th className="text-left px-3 py-2">Month</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Expected</th>
                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-3 py-2">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{r.tenant_name}</td>
                    <td className="px-3 py-1.5">{r.unit_no ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.building_name ?? '—'}</td>
                    <td className="px-3 py-1.5">{monthLabel(r.month)}</td>
                    <td className="px-3 py-1.5 text-center">
                      {r.status === 'partial'
                        ? <span className="text-orange-500 font-medium">Partial</span>
                        : <span className="text-red-600 font-semibold">Overdue</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatAED(r.expected_rent)}</td>
                    <td className="px-3 py-1.5 text-right">{r.amount_paid > 0 ? formatAED(r.amount_paid) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-red-600">{formatAED(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
