import { useSearchParams } from 'react-router-dom';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';

export default function RentalsBuildings() {
  const [searchParams] = useSearchParams();
  const buildingParam = searchParams.get('building');
  const initialBuildingId = buildingParam ? Number(buildingParam) || null : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Buildings</h1>
      <BuildingsTab readonly initialOpenId={initialBuildingId ?? undefined} />
    </div>
  );
}
