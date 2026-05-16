import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BillsReportView } from '@/components/reports/BillsReportView';
import { RentalReportView } from '@/components/reports/RentalReportView';
import { CombinedReportView } from '@/components/reports/CombinedReportView';
import { api } from '@/lib/api';
import { currentMonth } from '@/lib/utils';

export default function Reports() {
  const now = currentMonth();
  const [from, setFrom] = useState(now);
  const [to, setTo] = useState(now);
  const [activeTab, setActiveTab] = useState('bills');

  const { data, isLoading, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['reports', activeTab, from, to],
    queryFn: () => api.get(`/api/reports?type=${activeTab}&from=${from}&to=${to}`),
  });

  function arr<T>(key: string): T[] {
    return (data?.[key] as T[] | undefined) ?? [];
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button onClick={() => window.print()} variant="outline" size="sm">
          <Printer size={14} className="mr-2" /> Print / Export PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end mb-6 no-print">
        <div>
          <Label className="text-xs">From</Label>
          <input type="month" value={from} onChange={e => setFrom(e.target.value)}
            className="mt-1 block border rounded px-2 py-1 text-sm bg-background border-border" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <input type="month" value={to} onChange={e => setTo(e.target.value)}
            className="mt-1 block border rounded px-2 py-1 text-sm bg-background border-border" />
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Apply</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 no-print">
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="rental">Rental</TabsTrigger>
          <TabsTrigger value="combined">Combined</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading report…</div>
        ) : data ? (
          <>
            <TabsContent value="bills">
              <BillsReportView
                rows={arr('rows')}
                monthSummary={arr('monthSummary')}
                catSummary={arr('catSummary')}
                from={from} to={to}
              />
            </TabsContent>
            <TabsContent value="rental">
              <RentalReportView
                rows={arr('rows')}
                buildingSummary={arr('buildingSummary')}
                from={from} to={to}
              />
            </TabsContent>
            <TabsContent value="combined">
              <CombinedReportView
                monthSummary={arr('monthSummary')}
                rentMonthly={arr('rentMonthly')}
                from={from} to={to}
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
