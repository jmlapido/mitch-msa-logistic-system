import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { buildings: DashboardData['buildingOccupancy'] };

const TYPE_LABEL: Record<string, string> = {
  residential: 'Res',
  commercial:  'Com',
  mixed:       'Mix',
};

export function BuildingOccupancyWidget({ buildings }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Buildings — Occupancy</h3>
      {buildings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No buildings found</p>
      ) : (
        <div>
          {buildings.map(b => {
            const rate = b.total_units > 0 ? Math.round((b.occupied / b.total_units) * 100) : 0;
            const barColor = rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-400';
            return (
              <div
                key={b.building_id}
                className="group cursor-pointer py-1.5 hover:bg-muted rounded transition-colors px-1 border-b last:border-0"
                onClick={() => navigate(`/rentals?building=${b.building_id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">
                      {TYPE_LABEL[b.type] ?? b.type}
                    </span>
                    <span className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                      {b.building_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="text-green-600 dark:text-green-400 font-semibold">{b.occupied} occ</span>
                    <span className="text-muted-foreground">{b.vacant} vac</span>
                    <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">›</span>
                  </div>
                </div>
                <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full`} style={{ width: `${rate}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
