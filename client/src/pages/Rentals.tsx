import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';
import { UnitsTab } from '@/components/rentals/tabs/UnitsTab';
import { TenantsTab } from '@/components/rentals/tabs/TenantsTab';
import { PaymentsTab } from '@/components/rentals/tabs/PaymentsTab';

export default function Rentals() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Rentals</h1>
      <Tabs defaultValue="payments">
        <TabsList className="mb-4">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="tenants"><TenantsTab /></TabsContent>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        <TabsContent value="buildings"><BuildingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
