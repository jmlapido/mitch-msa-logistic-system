import { PrintHeader } from './PrintHeader';
import { formatAED, monthLabel } from '@/lib/utils';

type Row = {
  month: string; category_name: string; category_icon: string; category_color: string;
  property_name: string | null; particulars: string; amount: number; status: string;
  paid_date: string | null;
};
type MonthSummary = { month: string; total: number; paid: number; unpaid: number };
type CatSummary = { name: string; color: string; icon: string; total: number; paid: number };

type Props = {
  rows: Row[];
  monthSummary: MonthSummary[];
  catSummary: CatSummary[];
  from: string;
  to: string;
};

export function BillsReportView({ rows, monthSummary, catSummary, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const grandTotal = monthSummary.reduce((s, r) => s + r.total, 0);
  const grandPaid = monthSummary.reduce((s, r) => s + r.paid, 0);

  return (
    <div>
      <PrintHeader title="Bills Report" subtitle={subtitle} />

      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Bills Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">Monthly Summary</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Paid</th>
              <th className="text-right px-3 py-2">Unpaid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {monthSummary.map(r => (
              <tr key={r.month}>
                <td className="px-3 py-1.5 text-xs">{monthLabel(r.month)}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(r.total)}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{formatAED(r.paid)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">{formatAED(r.unpaid)}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-muted">
              <td className="px-3 py-1.5 text-xs">Total</td>
              <td className="px-3 py-1.5 text-right">{formatAED(grandTotal)}</td>
              <td className="px-3 py-1.5 text-right text-green-600">{formatAED(grandPaid)}</td>
              <td className="px-3 py-1.5 text-right text-red-600">{formatAED(grandTotal - grandPaid)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">By Category</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Paid</th>
              <th className="text-right px-3 py-2">Unpaid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {catSummary.map(r => (
              <tr key={r.name}>
                <td className="px-3 py-1.5 text-xs">{r.icon} {r.name}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(r.total)}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{formatAED(r.paid)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">{formatAED(r.total - r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Detail</h3>
        <table className="w-full text-xs border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Property</th>
              <th className="text-left px-3 py-2">Particulars</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Paid Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-3 py-1.5">{r.month}</td>
                <td className="px-3 py-1.5">{r.category_icon} {r.category_name}</td>
                <td className="px-3 py-1.5">{r.property_name ?? '—'}</td>
                <td className="px-3 py-1.5">{r.particulars}</td>
                <td className="px-3 py-1.5 text-right font-medium">{formatAED(r.amount)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={r.status === 'paid' ? 'text-green-600' : 'text-red-600'}>{r.status}</span>
                </td>
                <td className="px-3 py-1.5 text-center">{r.paid_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
