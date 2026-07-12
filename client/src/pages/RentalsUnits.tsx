import { useSearchParams } from 'react-router-dom';
import { useBuildings } from '@/lib/hooks/useRentals';
import { OccupancyTab } from '@/components/rentals/tabs/OccupancyTab';

export default function RentalsUnits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: buildings = [] } = useBuildings();
  const buildingParam = searchParams.get('building');
  const selectedId = buildingParam ? Number(buildingParam) || null : null;
  // Validate against the loaded list: a stray ?building= falls back to "all".
  const selected = buildings.find(b => b.id === selectedId) ?? null;

  function toggle(id: number) {
    if (selected?.id === id) setSearchParams({});
    else setSearchParams({ building: String(id) });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Buildings &amp; Units</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
        {buildings.map(b => (
          <div
            key={b.id}
            onClick={() => toggle(b.id)}
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-shadow hover:shadow ${selected?.id === b.id ? 'ring-2 ring-primary' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm truncate">{b.name}</p>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{b.type}</span>
            </div>
            {b.address && <p className="text-xs text-muted-foreground mt-1 truncate">{b.address}</p>}
            <p className="text-xs mt-2">
              <span className="text-muted-foreground">{b.unit_count} units</span>
              <span className="text-green-600 ml-2">{b.occupied_count} occupied</span>
              <span className="text-muted-foreground ml-2">{b.unit_count - b.occupied_count} vacant</span>
            </p>
          </div>
        ))}
      </div>

      {selected && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="text-muted-foreground">
            Showing units in <span className="font-medium text-foreground">{selected.name}</span>
          </span>
          <button onClick={() => setSearchParams({})} className="text-xs text-primary hover:underline">
            All buildings
          </button>
        </div>
      )}

      <OccupancyTab buildingId={selected?.id ?? null} />
    </div>
  );
}
