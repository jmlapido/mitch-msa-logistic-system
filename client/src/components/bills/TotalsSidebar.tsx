import { useMemo } from 'react';
import { formatAED } from '@/lib/utils';
import type { BillEntry } from '@/lib/hooks/useBills';

type Props = { entries: BillEntry[] };

export function TotalsSidebar({ entries }: Props) {
  const { byCategory, byProperty, grand } = useMemo(() => {
    const catMap: Record<string, { name: string; color: string; icon: string; total: number; paid: number; unpaid: number }> = {};
    const propMap: Record<string, { name: string; total: number; paid: number; unpaid: number }> = {};
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

      if (e.property_id) {
        const propKey = String(e.property_id);
        if (!propMap[propKey]) propMap[propKey] = { name: e.property_name!, total: 0, paid: 0, unpaid: 0 };
        propMap[propKey]!.total += amt;
        if (isPaid) propMap[propKey]!.paid += amt; else propMap[propKey]!.unpaid += amt;
      }
    }
    return {
      byCategory: Object.values(catMap).sort((a, b) => b.total - a.total),
      byProperty: Object.values(propMap).sort((a, b) => b.total - a.total),
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
    <div className="w-56 shrink-0 border-l pl-4 space-y-2">
      <div className="grid grid-cols-1 gap-2 mb-4">
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
      <Section title="By Category" rows={byCategory} />
      <Section title="By Property" rows={byProperty} />
    </div>
  );
}
