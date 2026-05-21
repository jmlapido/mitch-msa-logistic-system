import { useId, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { history: DashboardData['rentHistory'] };

function shortMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-AE', { month: 'short' });
}

export function RentTrendChart({ history }: Props) {
  const navigate = useNavigate();
  const uid = useId().replace(/:/g, '');
  const gradDueId = `gradDue-${uid}`;
  const gradCollId = `gradColl-${uid}`;
  const [freq, setFreq] = useState<'monthly' | 'annual'>('monthly');

  if (!history?.length) return null;

  const data = history.map(h => ({
    month: shortMonth(h.month),
    Due:       freq === 'monthly' ? h.due_monthly       : h.due_annual,
    Collected: freq === 'monthly' ? h.collected_monthly : h.collected_annual,
  }));

  return (
    <div
      className="bg-card border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate('/rentals')}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">6-Month Rent Trend</h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-3">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#8b5cf6 0 4px,transparent 4px 7px)' }} />Due
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block w-4 h-0.5 bg-emerald-500 rounded" />Collected
            </span>
          </div>
          <div
            className="flex rounded-md border overflow-hidden text-[10px]"
            onClick={e => e.stopPropagation()}
          >
            <button
              className={`px-2 py-0.5 transition-colors ${freq === 'monthly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setFreq('monthly')}
            >Monthly</button>
            <button
              className={`px-2 py-0.5 transition-colors ${freq === 'annual' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setFreq('annual')}
            >Annual</button>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradDueId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={gradCollId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value: number, name: string) => [formatAED(value), name]}
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
          />
          <Area type="monotone" dataKey="Due"       stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="5 3" fill={`url(#${gradDueId})`}  dot={false} />
          <Area type="monotone" dataKey="Collected" stroke="#10b981" strokeWidth={2}   fill={`url(#${gradCollId})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
