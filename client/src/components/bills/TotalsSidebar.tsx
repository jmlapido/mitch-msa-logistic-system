import { useMemo } from 'react';
import { formatAED } from '@/lib/utils';
import type { BillEntry } from '@/lib/hooks/useBills';

type Props = { entries: BillEntry[] };

export function TotalsSidebar({ entries }: Props) {
  const { byCategory, grand } = useMemo(() => {
    const catMap: Record<string, { name: string; color: string; icon: string; total: number; paid: number; unpaid: number }> = {};
    let total = 0, paid = 0, unpaid = 0;

    for (const e of entries) {
      const amt = e.amount;
      const isPaid = e.status === 'paid';
      total += amt;
      if (isPaid) paid += amt; else unpaid += amt;

      const catKey = String(e.category_id);
      if (!catMap[catKey]) catMap[catKey] = { name: e.category_name, color: e.category_color, icon: e.category_icon, total: 0, paid: 0, unpaid: 0 };
      catMap[catKey]!.total += amt;
      if (isPaid) catMap[catKey]!.paid += amt; else catMap[catKey]!.unpaid += amt;
    }
    return {
      byCategory: Object.values(catMap).sort((a, b) => b.total - a.total),
      grand: { total, paid, unpaid },
    };
  }, [entries]);

  const Section = ({ title, rows }: { title: string; rows: { name: string; total: number; paid: number; unpaid: number }[] }) => (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.name} className="text-xs">
            <div className="flex justify-between font-medium">
              <span className="truncate max-w-[120px]">{r.name}</span>
              <span>{formatAED(r.total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">✓ {formatAED(r.paid)}</span>
              <span className="text-red-600 dark:text-red-400">{formatAED(r.unpaid)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="md:w-56 md:shrink-0 md:border-l md:pl-4 space-y-2">
      <div className="grid grid-cols-3 md:grid-cols-1 gap-2 mb-4">
        {[
          { label: 'Total', value: grand.total, color: 'text-foreground' },
          { label: 'Paid', value: grand.paid, color: 'text-green-600 dark:text-green-400' },
          { label: 'Unpaid', value: grand.unpaid, color: 'text-red-600 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-muted rounded p-2">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-sm font-bold ${s.color}`}>{formatAED(s.value)}</div>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Section title="By Category" rows={byCategory} />
      </div>
    </div>
  );
}
