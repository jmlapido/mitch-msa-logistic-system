import { PrintHeader } from './PrintHeader';
import { formatAED, formatDate } from '@/lib/utils';

type ReportRow = {
  company_name: string;
  contract_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: string;
  total_paid: number;
  balance: number;
  status: string;
};

type PaymentRow = {
  company_name: string;
  amount: number;
  paid_date: string;
  payment_method: string;
  receipt_no?: string;
  notes?: string;
};

type Props = { rows: ReportRow[]; payments: PaymentRow[]; from: string; to: string };

const STATUS_STYLE: Record<string, string> = {
  paid:    'text-green-600',
  partial: 'text-orange-500',
  overdue: 'text-red-600 font-semibold',
  pending: 'text-yellow-600',
};

export function PartnersReportView({ rows, payments, from, to }: Props) {
  const subtitle = from === to ? from : `${from} – ${to}`;
  const totalExpected = rows.reduce((s, r) => s + r.expected_amount, 0);
  const totalCollected = rows.reduce((s, r) => s + r.total_paid, 0);
  const totalBalance = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <div>
      <PrintHeader title="Partners Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Partners Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Total Expected</p>
          <p className="text-base font-semibold">{formatAED(totalExpected)}</p>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Total Collected</p>
          <p className="text-base font-semibold text-green-600">{formatAED(totalCollected)}</p>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
          <p className={`text-base font-semibold ${totalBalance > 0 ? 'text-red-600' : ''}`}>{formatAED(totalBalance)}</p>
        </div>
      </div>

      {/* Per-partner table */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">By Partner</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Partner</th>
              <th className="text-left px-3 py-2">Frequency</th>
              <th className="text-right px-3 py-2">Expected</th>
              <th className="text-right px-3 py-2">Collected</th>
              <th className="text-right px-3 py-2">Balance</th>
              <th className="text-center px-3 py-2">Contract End</th>
              <th className="text-center px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.contract_id} className={r.status === 'overdue' ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                <td className="px-3 py-1.5 font-medium">{r.company_name}</td>
                <td className="px-3 py-1.5 text-xs capitalize text-muted-foreground">{r.payment_frequency}</td>
                <td className="px-3 py-1.5 text-right">{formatAED(r.expected_amount)}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{r.total_paid > 0 ? formatAED(r.total_paid) : '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.balance > 0 ? <span className="text-red-600 font-medium">{formatAED(r.balance)}</span> : <span className="text-green-600">—</span>}
                </td>
                <td className="px-3 py-1.5 text-center text-xs">{formatDate(r.end_date)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`text-xs capitalize ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment detail */}
      {payments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Payment Detail</h3>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="text-left px-3 py-2">Partner</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-left px-3 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5">{p.company_name}</td>
                  <td className="px-3 py-1.5 text-right text-green-600 font-medium">{formatAED(p.amount)}</td>
                  <td className="px-3 py-1.5">{formatDate(p.paid_date)}</td>
                  <td className="px-3 py-1.5 capitalize">{p.payment_method}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.receipt_no ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
