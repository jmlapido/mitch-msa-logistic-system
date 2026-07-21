import { PrintHeader } from './PrintHeader';
import { monthLabel } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

type Row = {
  name: string;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque';
  cheque_number: string | null;
  notes: string | null;
};
type MonthSummary = { month: string; total: number; count: number };

type Props = {
  rows: Row[];
  monthSummary: MonthSummary[];
  from: string;
  to: string;
};

export function CommissionsReportView({ rows, monthSummary, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const grandTotal = monthSummary.reduce((s, r) => s + r.total, 0);
  const grandCount = monthSummary.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <PrintHeader title="Commissions Report" subtitle={subtitle} />

      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Commissions Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-base font-bold">{<AedAmount amount={grandTotal} />}</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Count</p>
          <p className="text-base font-bold">{grandCount}</p>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">Monthly Summary</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {monthSummary.map(r => (
              <tr key={r.month}>
                <td className="px-3 py-1.5 text-xs">{monthLabel(r.month)}</td>
                <td className="px-3 py-1.5 text-right">{<AedAmount amount={r.total} />}</td>
                <td className="px-3 py-1.5 text-right">{r.count}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-muted">
              <td className="px-3 py-1.5 text-xs">Total</td>
              <td className="px-3 py-1.5 text-right">{<AedAmount amount={grandTotal} />}</td>
              <td className="px-3 py-1.5 text-right">{grandCount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="break-before-page">
        <h3 className="text-sm font-semibold mb-2">Detail</h3>
        <table className="w-full text-xs border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-center px-3 py-2">Date</th>
              <th className="text-center px-3 py-2">Method</th>
              <th className="text-left px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-right font-medium">{<AedAmount amount={r.amount} />}</td>
                <td className="px-3 py-1.5 text-center">{r.paid_date}</td>
                <td className="px-3 py-1.5 text-center capitalize">
                  {r.payment_method}
                  {r.payment_method === 'cheque' && r.cheque_number && ` · #${r.cheque_number}`}
                </td>
                <td className="px-3 py-1.5">{r.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
