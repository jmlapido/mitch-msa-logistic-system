import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BillsReportView } from '@/components/reports/BillsReportView';
import { RentalReportView } from '@/components/reports/RentalReportView';
import { CombinedReportView } from '@/components/reports/CombinedReportView';
import { OutstandingReportView } from '@/components/reports/OutstandingReportView';
import { ExpiringLeasesReportView } from '@/components/reports/ExpiringLeasesReportView';
import { PartnersReportView } from '@/components/reports/PartnersReportView';
import { CommissionsReportView } from '@/components/reports/CommissionsReportView';
import { useBuildings } from '@/lib/hooks/useRentals';
import { api } from '@/lib/api';
import { currentMonth } from '@/lib/utils';

const TABS = [
  { value: 'rental',      label: 'Rent Collection' },
  { value: 'outstanding', label: 'Outstanding'      },
  { value: 'bills',       label: 'Bills'            },
  { value: 'commissions', label: 'Commissions'      },
  { value: 'expiring',    label: 'Expiring Leases'  },
  { value: 'combined',    label: 'P&L Summary'      },
  { value: 'partners',    label: 'Sponsorships'     },
];

export default function Reports() {
  const now = currentMonth();
  const [from, setFrom] = useState(now);
  const [to, setTo] = useState(now);
  const [activeTab, setActiveTab] = useState('rental');
  const [buildingId, setBuildingId] = useState('');
  const { data: buildings = [] } = useBuildings();

  const buildingParam = buildingId && activeTab === 'bills' ? `&building_id=${buildingId}` : '';
  const { data, isLoading, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['reports', activeTab, from, to, buildingId],
    queryFn: () => api.get(`/api/reports?type=${activeTab}&from=${from}&to=${to}${buildingParam}`),
  });

  const selectedBuilding = buildings.find(b => String(b.id) === buildingId);

  function arr<T>(key: string): T[] {
    return (data?.[key] as T[] | undefined) ?? [];
  }

  const showDateRange = activeTab !== 'outstanding';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button onClick={() => window.print()} variant="outline" size="sm">
          <Printer size={14} className="mr-2" /> Print / Export PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end mb-6 no-print">
        {showDateRange && (
          <>
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
          </>
        )}
        {activeTab === 'bills' && (
          <div>
            <Label className="text-xs">Building</Label>
            <select value={buildingId} onChange={e => setBuildingId(e.target.value)}
              className="mt-1 block border rounded px-2 py-1 text-sm bg-background border-border">
              <option value="">All buildings</option>
              {buildings.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </div>
        )}
        {showDateRange && (
          <Button size="sm" variant="outline" onClick={() => refetch()}>Apply</Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 no-print flex-wrap h-auto gap-1">
          {TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading report…</div>
        ) : data ? (
          <>
            <TabsContent value="rental">
              <RentalReportView
                rows={arr('rows')}
                buildingSummary={arr('buildingSummary')}
                from={from} to={to}
              />
            </TabsContent>

            <TabsContent value="outstanding">
              <OutstandingReportView
                rows={arr('rows')}
                tenantSummary={arr('tenantSummary')}
              />
            </TabsContent>

            <TabsContent value="bills">
              <BillsReportView
                rows={arr('rows')}
                monthSummary={arr('monthSummary')}
                catSummary={arr('catSummary')}
                from={from} to={to}
                buildingName={selectedBuilding?.name}
              />
            </TabsContent>

            <TabsContent value="commissions">
              <CommissionsReportView
                rows={arr('rows')}
                monthSummary={arr('monthSummary')}
                from={from} to={to}
              />
            </TabsContent>

            <TabsContent value="expiring">
              <ExpiringLeasesReportView
                rows={arr('rows')}
                from={from} to={to}
              />
            </TabsContent>

            <TabsContent value="combined">
              <CombinedReportView
                monthSummary={arr('monthSummary')}
                rentMonthly={arr('rentMonthly')}
                commissionsMonthly={arr('commissionsMonthly')}
                from={from} to={to}
              />
            </TabsContent>

            <TabsContent value="partners">
              <PartnersReportView
                rows={arr('rows')}
                payments={arr('payments')}
                from={from} to={to}
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
