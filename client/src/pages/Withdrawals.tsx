import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonthYearSelector } from '@/components/ui/MonthYearSelector';
import { AedAmount } from '@/components/ui/AedAmount';
import { WithdrawalsTable } from '@/components/withdrawals/WithdrawalsTable';
import { WithdrawalFormModal } from '@/components/withdrawals/WithdrawalFormModal';
import { useWithdrawals } from '@/lib/hooks/useWithdrawals';
import { currentMonth } from '@/lib/utils';
import type { Withdrawal } from '@/lib/hooks/useWithdrawals';

export default function Withdrawals() {
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Withdrawal | null>(null);
  const { data, isLoading } = useWithdrawals(month);

  const byPerson = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data?.rows ?? []) {
      totals.set(row.withdrawn_by, (totals.get(row.withdrawn_by) ?? 0) + row.amount);
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [data?.rows]);

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(row: Withdrawal) { setEditing(row); setModalOpen(true); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Withdrawals</h1>
          <div className="mt-1">
            <MonthYearSelector month={month} onChange={setMonth} />
          </div>
        </div>
        <Button onClick={openAdd} size="sm"><Plus size={14} className="mr-1" /> Add Withdrawal</Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="border rounded-lg px-4 py-3 bg-card max-w-xs">
          <p className="text-xs text-muted-foreground mb-1">Total this month</p>
          <p className="text-base font-semibold"><AedAmount amount={data?.total ?? 0} /></p>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-card max-w-xs">
          <p className="text-xs text-muted-foreground mb-1">Cash on Hand</p>
          <p className={`text-base font-semibold ${(data?.cash_on_hand ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
            <AedAmount amount={data?.cash_on_hand ?? 0} />
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading withdrawals…</div>
      ) : (
        <div className="flex flex-col-reverse gap-6 md:flex-row">
          <div className="flex-1 min-w-0">
            <WithdrawalsTable rows={data?.rows ?? []} onEdit={openEdit} />
          </div>

          <div className="md:w-56 md:shrink-0 md:border-l md:pl-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Person</h3>
            {byPerson.length === 0 ? (
              <p className="text-xs text-muted-foreground">No withdrawals yet</p>
            ) : (
              <div className="space-y-2">
                {byPerson.map(p => (
                  <div key={p.name} className="border rounded-lg px-3 py-2 bg-card">
                    <p className="text-xs text-muted-foreground mb-0.5">{p.name}</p>
                    <p className="text-sm font-semibold"><AedAmount amount={p.total} /></p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <WithdrawalFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />
    </div>
  );
}
