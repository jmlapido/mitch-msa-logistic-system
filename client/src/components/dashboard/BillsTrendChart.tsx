import { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { history: DashboardData['billsHistory'] };

function shortMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-AE', { month: 'short' });
}

export function BillsTrendChart({ history }: Props) {
  const navigate = useNavigate();
  const uid = useId().replace(/:/g, '');
  const gradTotalId = `gradTotal-${uid}`;
  const gradUnpaidId = `gradUnpaid-${uid}`;

  if (!history?.length) return null;

  const data = history.map(h => ({
    month: shortMonth(h.month),
    Total: h.total,
    Unpaid: h.unpaid,
  }));

  return (
    <div
      className="bg-card border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate('/bills')}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">6-Month Bills Trend</h3>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-4 h-0.5 bg-blue-500 rounded" />Total
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-4 h-0.5 bg-amber-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#f59e0b 0 4px,transparent 4px 7px)' }} />Unpaid
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradTotalId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={gradUnpaidId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value: number, name: string) => [formatAED(value), name]}
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
          />
          <Area type="monotone" dataKey="Total"  stroke="#3b82f6" strokeWidth={2} fill={`url(#${gradTotalId})`}  dot={false} />
          <Area type="monotone" dataKey="Unpaid" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" fill={`url(#${gradUnpaidId})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
