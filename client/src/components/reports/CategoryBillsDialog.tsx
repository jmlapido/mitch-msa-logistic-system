import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MonthYearSelector } from '@/components/ui/MonthYearSelector';
import { AedAmount } from '@/components/ui/AedAmount';
import { PrintHeader } from './PrintHeader';
import { monthLabel, currentMonth } from '@/lib/utils';
import { api } from '@/lib/api';

export type BillRow = {
  month: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  particulars: string;
  amount: number;
  status: string;
  paid_date: string | null;
  building_name: string | null;
};

export type MonthTotal = { month: string; total: number; paid: number; unpaid: number };

export function buildYearlyCategorySummary(rows: BillRow[], year: number): MonthTotal[] {
  const months: MonthTotal[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    total: 0,
    paid: 0,
    unpaid: 0,
  }));
  const byMonth = new Map(months.map(m => [m.month, m]));
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (!entry) continue;
    entry.total += row.amount;
    if (row.status === 'paid') entry.paid += row.amount;
    else entry.unpaid += row.amount;
  }
  return months;
}

type Category = { id: number; name: string; icon: string; color: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
};

export function CategoryBillsDialog({ open, onOpenChange, category }: Props) {
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (open) {
      setMonth(currentMonth());
      setYear(new Date().getFullYear());
    }
  }, [open, category?.id]);

  useEffect(() => {
    function cleanup() { document.body.classList.remove('printing-dialog'); }
    window.addEventListener('afterprint', cleanup);
    return () => window.removeEventListener('afterprint', cleanup);
  }, []);

  function handlePrint() {
    document.body.classList.add('printing-dialog');
    window.print();
  }

  const { data: monthData } = useQuery<{ rows: BillRow[] }>({
    queryKey: ['reports', 'bills', 'category-month', category?.id, month],
    queryFn: () => api.get(`/api/reports?type=bills&from=${month}&to=${month}&category_id=${category!.id}`),
    enabled: open && !!category,
  });

  const { data: yearData } = useQuery<{ rows: BillRow[] }>({
    queryKey: ['reports', 'bills', 'category-year', category?.id, year],
    queryFn: () => api.get(`/api/reports?type=bills&from=${year}-01&to=${year}-12&category_id=${category!.id}`),
    enabled: open && !!category,
  });

  const monthRows = monthData?.rows ?? [];
  const monthTotal = monthRows.reduce((s, r) => s + r.amount, 0);
  const monthPaid = monthRows.reduce((s, r) => s + (r.status === 'paid' ? r.amount : 0), 0);

  const yearSummary = buildYearlyCategorySummary(yearData?.rows ?? [], year);
  const yearTotal = yearSummary.reduce((s, m) => s + m.total, 0);
  const yearPaid = yearSummary.reduce((s, m) => s + m.paid, 0);

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl print:static print:translate-x-0 print:translate-y-0 print:max-w-full print:shadow-none print:border-none">
        <DialogHeader className="no-print flex-row items-center justify-between space-y-0 pr-6 text-left">
          <DialogTitle>{category.icon} {category.name}</DialogTitle>
          <Button onClick={handlePrint} variant="outline" size="sm">
            <Printer size={14} className="mr-2" /> Print
          </Button>
        </DialogHeader>

        <Tabs defaultValue="month">
          <TabsList className="mb-3 no-print">
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>

          <TabsContent value="month">
            <PrintHeader title="Bills Report" subtitle={`${category.icon} ${category.name} · ${monthLabel(month)}`} />
            <div className="flex items-center justify-between mb-3">
              <div className="no-print">
                <MonthYearSelector month={month} onChange={setMonth} />
              </div>
              <div className="text-xs text-muted-foreground">
                Total <AedAmount amount={monthTotal} /> · Paid <AedAmount amount={monthPaid} /> · Unpaid <AedAmount amount={monthTotal - monthPaid} />
              </div>
            </div>
            {monthRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No bills for this category in {monthLabel(month)}.</p>
            ) : (
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Particulars</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-center px-3 py-2">Status</th>
                    <th className="text-center px-3 py-2">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthRows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <div>{r.particulars}</div>
                        {r.building_name && <div className="text-xs text-muted-foreground">{r.building_name}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium"><AedAmount amount={r.amount} /></td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={r.status === 'paid' ? 'text-green-600' : 'text-red-600'}>{r.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center">{r.paid_date ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="year">
            <PrintHeader title="Bills Report" subtitle={`${category.icon} ${category.name} · ${year}`} />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1 no-print">
                <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-medium w-12 text-center">{year}</span>
                <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Total <AedAmount amount={yearTotal} /> · Paid <AedAmount amount={yearPaid} /> · Unpaid <AedAmount amount={yearTotal - yearPaid} />
              </div>
            </div>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Month</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-3 py-2">Unpaid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {yearSummary.map(m => (
                  <tr key={m.month}>
                    <td className="px-3 py-1.5 text-xs">{monthLabel(m.month)}</td>
                    <td className="px-3 py-1.5 text-right"><AedAmount amount={m.total} /></td>
                    <td className="px-3 py-1.5 text-right text-green-600"><AedAmount amount={m.paid} /></td>
                    <td className="px-3 py-1.5 text-right text-red-600"><AedAmount amount={m.unpaid} /></td>
                  </tr>
                ))}
                <tr className="font-semibold bg-muted">
                  <td className="px-3 py-1.5 text-xs">Total</td>
                  <td className="px-3 py-1.5 text-right"><AedAmount amount={yearTotal} /></td>
                  <td className="px-3 py-1.5 text-right text-green-600"><AedAmount amount={yearPaid} /></td>
                  <td className="px-3 py-1.5 text-right text-red-600"><AedAmount amount={yearTotal - yearPaid} /></td>
                </tr>
              </tbody>
            </table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
