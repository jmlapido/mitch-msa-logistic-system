import { PrintHeader } from './PrintHeader';
import { monthLabel, formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

type Row = {
  month: string; tenant_name: string; unit_no: string; building_name: string;
  expected_rent: number; amount_paid: number; status: string; paid_date?: string; receipt_no?: string;
};
type BuildingSummary = {
  building_name: string; unit_count: number;
  total_expected: number; total_collected: number;
  count_collected: number; count_partial: number; count_unpaid: number;
};

type Props = { rows: Row[]; buildingSummary: BuildingSummary[]; from: string; to: string };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  collected: { label: 'Collected', cls: 'text-green-600' },
  partial:   { label: 'Partial',   cls: 'text-orange-500' },
  overdue:   { label: 'Overdue',   cls: 'text-red-600 font-semibold' },
  pending:   { label: 'Pending',   cls: 'text-yellow-600' },
};

export function RentalReportView({ rows, buildingSummary, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const grandExpected = buildingSummary.reduce((s, b) => s + b.total_expected, 0);
  const grandCollected = buildingSummary.reduce((s, b) => s + b.total_collected, 0);

  return (
    <div>
      <PrintHeader title="Rent Collection Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Rent Collection Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Building summary */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">By Building</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Building</th>
              <th className="text-right px-3 py-2">Expected</th>
              <th className="text-right px-3 py-2">Collected</th>
              <th className="text-right px-3 py-2">Collection Rate</th>
              <th className="text-right px-3 py-2">Full / Partial / Unpaid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {buildingSummary.map(b => (
              <tr key={b.building_name}>
                <td className="px-3 py-1.5 font-medium">{b.building_name}</td>
                <td className="px-3 py-1.5 text-right">{<AedAmount amount={b.total_expected} />}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{<AedAmount amount={b.total_collected} />}</td>
                <td className="px-3 py-1.5 text-right">
                  {b.total_expected > 0 ? `${Math.round((b.total_collected / b.total_expected) * 100)}%` : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs">
                  <span className="text-green-600">{b.count_collected}</span>
                  {' / '}
                  <span className="text-orange-500">{b.count_partial}</span>
                  {' / '}
                  <span className="text-red-600">{b.count_unpaid}</span>
                </td>
              </tr>
            ))}
            <tr className="font-semibold bg-muted text-xs">
              <td className="px-3 py-1.5">Total</td>
              <td className="px-3 py-1.5 text-right">{<AedAmount amount={grandExpected} />}</td>
              <td className="px-3 py-1.5 text-right text-green-600">{<AedAmount amount={grandCollected} />}</td>
              <td className="px-3 py-1.5 text-right">
                {grandExpected > 0 ? `${Math.round((grandCollected / grandExpected) * 100)}%` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className="text-green-600">{buildingSummary.reduce((s, b) => s + b.count_collected, 0)}</span>
                {' / '}
                <span className="text-orange-500">{buildingSummary.reduce((s, b) => s + b.count_partial, 0)}</span>
                {' / '}
                <span className="text-red-600">{buildingSummary.reduce((s, b) => s + b.count_unpaid, 0)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment detail */}
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
              <th className="text-right px-3 py-2">Balance</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const balance = r.expected_rent - r.amount_paid;
              const s = STATUS_LABEL[r.status] ?? { label: r.status, cls: '' };
              return (
                <tr key={i} className={r.status === 'overdue' || r.status === 'partial' ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                  <td className="px-3 py-1.5">{monthLabel(r.month)}</td>
                  <td className="px-3 py-1.5">{r.building_name}</td>
                  <td className="px-3 py-1.5 font-medium">{r.unit_no}</td>
                  <td className="px-3 py-1.5">{r.tenant_name}</td>
                  <td className="px-3 py-1.5 text-right">{<AedAmount amount={r.expected_rent} />}</td>
                  <td className="px-3 py-1.5 text-right">{r.amount_paid > 0 ? <AedAmount amount={r.amount_paid} /> : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{balance > 0 ? <span className="text-red-600">{<AedAmount amount={balance} />}</span> : '—'}</td>
                  <td className="px-3 py-1.5 text-center"><span className={s.cls}>{s.label}</span></td>
                  <td className="px-3 py-1.5 text-center">{formatDate(r.paid_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
