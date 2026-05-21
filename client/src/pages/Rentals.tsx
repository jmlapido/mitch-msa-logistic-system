import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';
import { UnitsTab } from '@/components/rentals/tabs/UnitsTab';
import { TenantsTab } from '@/components/rentals/tabs/TenantsTab';
import { PaymentsTab } from '@/components/rentals/tabs/PaymentsTab';
import { ArchivedTab } from '@/components/rentals/tabs/ArchivedTab';
import { ArchiveBanner } from '@/components/rentals/ArchiveBanner';

export default function Rentals() {
  const [searchParams] = useSearchParams();
  const buildingParam = searchParams.get('building');
  const tenantParam = searchParams.get('tenant');

  const defaultTab = buildingParam ? 'buildings' : tenantParam ? 'tenants' : 'payments';
  const initialBuildingId = buildingParam ? Number(buildingParam) || null : null;
  const initialTenantId = tenantParam ? Number(tenantParam) || null : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Rentals</h1>
      <ArchiveBanner />
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="tenants"><TenantsTab initialOpenId={initialTenantId ?? undefined} /></TabsContent>
        <TabsContent value="units"><UnitsTab readonly /></TabsContent>
        <TabsContent value="buildings"><BuildingsTab readonly initialOpenId={initialBuildingId ?? undefined} /></TabsContent>
        <TabsContent value="archived"><ArchivedTab /></TabsContent>
      </Tabs>
    </div>
  );
}
