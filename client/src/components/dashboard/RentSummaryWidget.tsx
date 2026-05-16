import { formatAED } from '@/lib/utils';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { buildings: DashboardData['rentByBuilding'] };

export function RentSummaryWidget({ buildings }: Props) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Rent Collection</h3>
      {buildings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No rental data</p>
      ) : (
        <div className="space-y-3">
          {buildings.map(b => {
            const rate = b.expected > 0 ? Math.round((b.collected / b.expected) * 100) : 0;
            return (
              <div key={b.building_id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{b.building_name}</span>
                  <span className="text-xs text-muted-foreground">{rate}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${rate}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span className="text-green-600">{formatAED(b.collected)} collected</span>
                  <span>{formatAED(b.expected)} expected</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
