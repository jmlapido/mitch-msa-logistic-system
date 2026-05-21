import { useMemo } from 'react';
import { AedAmount } from '@/components/ui/AedAmount';
import type { BillEntry } from '@/lib/hooks/useBills';
import { useBillsYearlySummary } from '@/lib/hooks/useBills';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type Props = { entries: BillEntry[]; month: string };

export function TotalsSidebar({ entries, month }: Props) {
  const year = month.slice(0, 4);
  const { data: yearlySummary = [] } = useBillsYearlySummary(year);

  const { byCategory } = useMemo(() => {
    const catMap: Record<string, { name: string; color: string; icon: string; total: number; paid: number; unpaid: number }> = {};

    for (const e of entries) {
      const amt = e.amount;
      const isPaid = e.status === 'paid';
      const catKey = String(e.category_id);
      if (!catMap[catKey]) catMap[catKey] = { name: e.category_name, color: e.category_color, icon: e.category_icon, total: 0, paid: 0, unpaid: 0 };
      catMap[catKey]!.total += amt;
      if (isPaid) catMap[catKey]!.paid += amt; else catMap[catKey]!.unpaid += amt;
    }
    return { byCategory: Object.values(catMap).sort((a, b) => b.total - a.total) };
  }, [entries]);

  const summaryByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of yearlySummary) map[s.month] = s.unpaid;
    return map;
  }, [yearlySummary]);

  const ytdUnpaid = yearlySummary.reduce((s, r) => s + r.unpaid, 0);

  return (
    <div className="md:w-56 md:shrink-0 md:border-l md:pl-4 space-y-4">
      <div className="hidden md:block">
        {byCategory.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Category</h3>
            <div className="space-y-1">
              {byCategory.map(r => (
                <div key={r.name} className="text-xs">
                  <div className="flex justify-between font-medium">
                    <span className="truncate max-w-[120px]">{r.name}</span>
                    <span><AedAmount amount={r.total} /></span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400">✓ <AedAmount amount={r.paid} /></span>
                    <span className="text-red-600 dark:text-red-400"><AedAmount amount={r.unpaid} /></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Unpaid — {year}</h3>
          <div className="space-y-0.5">
            {MONTHS.map((label, i) => {
              const m = `${year}-${String(i + 1).padStart(2, '0')}`;
              const unpaid = summaryByMonth[m] ?? null;
              const isCurrent = m === month;
              return (
                <div
                  key={m}
                  className={`flex justify-between text-xs px-1.5 py-0.5 rounded ${isCurrent ? 'bg-muted font-semibold' : ''}`}
                >
                  <span className={isCurrent ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  {unpaid === null ? (
                    <span className="text-muted-foreground/40">—</span>
                  ) : unpaid === 0 ? (
                    <span className="text-green-600 dark:text-green-400">AED 0</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400"><AedAmount amount={unpaid} /></span>
                  )}
                </div>
              );
            })}
          </div>
          {ytdUnpaid > 0 && (
            <div className="flex justify-between text-xs font-semibold border-t mt-2 pt-2">
              <span className="text-muted-foreground">YTD Unpaid</span>
              <span className="text-red-600 dark:text-red-400"><AedAmount amount={ytdUnpaid} /></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
