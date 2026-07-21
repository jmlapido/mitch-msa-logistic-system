import { PrintHeader } from './PrintHeader';
import { monthLabel } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type MonthSummary = { month: string; total: number; paid: number; unpaid: number };
type RentMonthly = { month: string; expected: number; collected: number };
type CommissionsMonthly = { month: string; total: number };

type Props = {
  monthSummary: MonthSummary[];
  rentMonthly: RentMonthly[];
  commissionsMonthly: CommissionsMonthly[];
  from: string;
  to: string;
};

export function CombinedReportView({ monthSummary, rentMonthly, commissionsMonthly, from, to }: Props) {
  const subtitle = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;

  const months = [...new Set([
    ...monthSummary.map(r => r.month),
    ...rentMonthly.map(r => r.month),
    ...commissionsMonthly.map(r => r.month),
  ])].sort();

  const chartData = months.map(month => {
    const bills = monthSummary.find(r => r.month === month);
    const rent = rentMonthly.find(r => r.month === month);
    const commissions = commissionsMonthly.find(r => r.month === month);
    return {
      month: month.slice(5),
      Bills: bills?.total ?? 0,
      'Rent In': rent?.collected ?? 0,
      'Commissions In': commissions?.total ?? 0,
    };
  });

  const totalOut = monthSummary.reduce((s, r) => s + r.total, 0);
  const totalRentIn = rentMonthly.reduce((s, r) => s + r.collected, 0);
  const totalCommissionsIn = commissionsMonthly.reduce((s, r) => s + r.total, 0);
  const netPosition = totalRentIn + totalCommissionsIn - totalOut;

  return (
    <div>
      <PrintHeader title="Combined Financial Report" subtitle={subtitle} />
      <div className="no-print mb-4">
        <h2 className="text-lg font-semibold">Combined Report</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Bills', value: totalOut, color: 'text-red-600 dark:text-red-400' },
          { label: 'Rent Collected', value: totalRentIn, color: 'text-green-600 dark:text-green-400' },
          { label: 'Commissions In', value: totalCommissionsIn, color: 'text-green-600 dark:text-green-400' },
          { label: 'Net Position', value: netPosition, color: netPosition >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
        ].map(c => (
          <div key={c.label} className="bg-card border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-base font-bold ${c.color}`}>{<AedAmount amount={c.value} />}</p>
          </div>
        ))}
      </div>

      {chartData.length > 1 && (
        <div className="mb-6 no-print">
          <h3 className="text-sm font-semibold mb-3">Monthly Comparison</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => <AedAmount amount={v} />} />
              <Legend />
              <Bar dataKey="Bills" fill="#f87171" />
              <Bar dataKey="Rent In" fill="#4ade80" />
              <Bar dataKey="Commissions In" fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted text-xs">
          <tr>
            <th className="text-left px-3 py-2">Month</th>
            <th className="text-right px-3 py-2">Bills Out</th>
            <th className="text-right px-3 py-2">Rent In</th>
            <th className="text-right px-3 py-2">Commissions In</th>
            <th className="text-right px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {months.map(month => {
            const bills = monthSummary.find(r => r.month === month);
            const rent = rentMonthly.find(r => r.month === month);
            const commissions = commissionsMonthly.find(r => r.month === month);
            const net = (rent?.collected ?? 0) + (commissions?.total ?? 0) - (bills?.total ?? 0);
            return (
              <tr key={month}>
                <td className="px-3 py-1.5">{monthLabel(month)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">{<AedAmount amount={bills?.total ?? 0} />}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{<AedAmount amount={rent?.collected ?? 0} />}</td>
                <td className="px-3 py-1.5 text-right text-green-600">{<AedAmount amount={commissions?.total ?? 0} />}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{<AedAmount amount={net} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
