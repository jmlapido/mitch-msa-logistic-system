import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useUnits, type Unit } from '@/lib/hooks/useRentals';
import { formatDate } from '@/lib/utils';

function occupancyBadge(status: Unit['occupancy_status']) {
  if (status === 'vacant') return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">Vacant</span>;
  if (status === 'expiring') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Expiring</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Occupied</span>;
}

export function OccupancyTab() {
  const { data: units = [], isLoading } = useUnits();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = units.reduce<Record<string, Unit[]>>((acc, u) => {
    (acc[u.building_name] ??= []).push(u);
    return acc;
  }, {});
  const buildings = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-3">
      {buildings.map(name => {
        const list = grouped[name]!;
        const occupied = list.filter(u => u.occupancy_status !== 'vacant').length;
        const isCollapsed = collapsed[name] ?? false;
        return (
          <div key={name} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60 select-none"
              onClick={() => setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))}
            >
              {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
              <span className="text-xs font-semibold uppercase tracking-wide">{name}</span>
              <span className="text-xs text-muted-foreground ml-1">· {occupied}/{list.length} occupied</span>
            </div>
            {!isCollapsed && (
              <div className="divide-y">
                {list.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="w-16 shrink-0">
                      <p className="text-sm font-medium">{u.unit_no}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{u.type}</p>
                    </div>
                    {occupancyBadge(u.occupancy_status)}
                    <div className="flex-1 min-w-0 text-sm truncate">
                      {u.tenant_id ? (
                        <Link to={`/customers?id=${u.tenant_id}`} className="capitalize text-primary hover:underline">
                          {u.tenant_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    {u.lease_end && (
                      <span className="text-xs text-muted-foreground shrink-0">until {formatDate(u.lease_end)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
