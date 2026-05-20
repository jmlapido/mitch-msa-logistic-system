import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PartnersTab } from '@/components/partners/tabs/PartnersTab';
import { PaymentsTab } from '@/components/partners/tabs/PaymentsTab';

export default function Partners() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Partners</h1>
      <Tabs defaultValue="partners">
        <TabsList className="mb-4">
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="partners"><PartnersTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
