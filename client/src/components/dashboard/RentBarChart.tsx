import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { buildings: DashboardData['rentByBuilding'] };

export function barColor(rate: number): string {
  if (rate >= 80) return '#22c55e';
  if (rate >= 50) return '#f59e0b';
  return '#ef4444';
}

export function RentBarChart({ buildings }: Props) {
  const navigate = useNavigate();

  const data = buildings.map(b => ({
    name: b.building_name,
    id: b.building_id,
    rate: b.expected > 0 ? Math.round((b.collected / b.expected) * 100) : 0,
    collected: b.collected,
    expected: b.expected,
  }));

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Rent Collection by Building</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No rental data</p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * 44 + 16}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            onClick={(e) => {
              if (e?.activePayload?.[0]) {
                const building = e.activePayload[0].payload as { id: number };
                navigate(`/rentals?building=${building.id}`);
              }
            }}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as { name: string; rate: number; collected: number; expected: number };
                return (
                  <div className="bg-card border rounded-md p-2 text-xs shadow">
                    <p className="font-semibold mb-1">{d.name}</p>
                    <p className="text-green-600"><AedAmount amount={d.collected} /> collected</p>
                    <p className="text-muted-foreground"><AedAmount amount={d.expected} /> expected</p>
                    <p className="font-bold mt-1">{d.rate}% rate</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="rate" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={barColor(entry.rate)} />
              ))}
              <LabelList
                dataKey="rate"
                position="right"
                formatter={(v: number) => `${v}%`}
                style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
