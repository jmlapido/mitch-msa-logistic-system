import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';
import { UnitsTab } from '@/components/rentals/tabs/UnitsTab';
import { TenantsTab } from '@/components/rentals/tabs/TenantsTab';
import { PaymentsTab } from '@/components/rentals/tabs/PaymentsTab';

export default function Rentals() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Rentals</h1>
      <Tabs defaultValue="buildings">
        <TabsList className="mb-4">
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="buildings"><BuildingsTab /></TabsContent>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        <TabsContent value="tenants"><TenantsTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
