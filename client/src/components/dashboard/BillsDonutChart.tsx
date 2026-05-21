import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

type Props = { paid: number; unpaid: number };

export function BillsDonutChart({ paid, unpaid }: Props) {
  const navigate = useNavigate();
  const total = paid + unpaid;
  const rate = total > 0 ? Math.round((paid / total) * 100) : 0;

  const data = [
    { name: 'Paid', value: paid },
    { name: 'Unpaid', value: unpaid },
  ];

  return (
    <div
      className="bg-card border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate('/bills')}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Bills Breakdown</h3>
      <div className="flex items-center gap-4">
        <div className="relative w-[90px] h-[90px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={42}
                dataKey="value"
                strokeWidth={0}
              >
                <Cell fill="#22c55e" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [formatAED(value), name]}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm font-bold leading-none">{rate}%</span>
            <span className="text-[9px] text-muted-foreground">paid</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="font-semibold"><AedAmount amount={paid} /></span>
            <span className="text-muted-foreground">Paid</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="font-semibold"><AedAmount amount={unpaid} /></span>
            <span className="text-muted-foreground">Unpaid</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-muted shrink-0 border" />
            <span className="font-semibold"><AedAmount amount={total} /></span>
            <span className="text-muted-foreground">Total</span>
          </div>
        </div>
      </div>
    </div>
  );
}
