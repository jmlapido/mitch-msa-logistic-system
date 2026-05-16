import { PrintHeader } from './PrintHeader';
import { formatAED, monthLabel, formatDate } from '@/lib/utils';

type Row = {
  month: string; tenant_name: string; unit_no: string; building_name: string;
  expected_rent: number; amount: number; status: string; paid_date?: string; receipt_no?: string;
};
type BuildingSummary = { building_name: string; unit_count: number; total_expected: number; total_collected: number };

type Props = { rows: Row[]; buildingSummary: BuildingSummary[]; from: string; to: string };

export function RentalReportView({ rows, buildingSummary, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  return (
    <div>
      <PrintHeader title="Rental Collection Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Rental Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">By Building</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Building</th>
              <th className="text-right px-3 py-2">Units</th>
              <th className="text-right px-3 py-2">Expected</th>
              <th className="text-right px-3 py-2">Collected</th>
              <th className="text-right px-3 py-2">Collection Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {buildingSummary.map(b => (
              <tr key={b.building_name}>
                <td className="px-3 py-1.5 font-medium">{b.building_name}</td>
                <td className="px-3 py-1.5 text-right">{b.unit_count}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(b.total_expected)}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{formatAED(b.total_collected)}</td>
                <td className="px-3 py-1.5 text-right">
                  {b.total_expected > 0 ? `${Math.round((b.total_collected / b.total_expected) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Payment Detail</h3>
        <table className="w-full text-xs border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-left px-3 py-2">Building</th>
              <th className="text-left px-3 py-2">Unit</th>
              <th className="text-left px-3 py-2">Tenant</th>
              <th className="text-right px-3 py-2">Expected</th>
              <th className="text-right px-3 py-2">Collected</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-3 py-1.5">{r.month}</td>
                <td className="px-3 py-1.5">{r.building_name}</td>
                <td className="px-3 py-1.5 font-medium">{r.unit_no}</td>
                <td className="px-3 py-1.5">{r.tenant_name}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(r.expected_rent)}</td>
                <td className="px-3 py-1.5 text-right">{r.status === 'collected' ? formatAED(r.amount) : '—'}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={r.status === 'collected' ? 'text-green-600' : 'text-yellow-600 dark:text-yellow-400'}>{r.status}</span>
                </td>
                <td className="px-3 py-1.5 text-center">{formatDate(r.paid_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
