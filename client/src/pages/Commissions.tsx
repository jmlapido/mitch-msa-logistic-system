import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonthYearSelector } from '@/components/ui/MonthYearSelector';
import { AedAmount } from '@/components/ui/AedAmount';
import { CommissionsTable } from '@/components/commissions/CommissionsTable';
import { CommissionFormModal } from '@/components/commissions/CommissionFormModal';
import { useCommissions } from '@/lib/hooks/useCommissions';
import { currentMonth } from '@/lib/utils';
import type { Commission } from '@/lib/hooks/useCommissions';

export default function Commissions() {
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Commission | null>(null);
  const { data, isLoading } = useCommissions(month);

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(row: Commission) { setEditing(row); setModalOpen(true); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Commissions</h1>
          <div className="mt-1">
            <MonthYearSelector month={month} onChange={setMonth} />
          </div>
        </div>
        <Button onClick={openAdd} size="sm"><Plus size={14} className="mr-1" /> Add Commission</Button>
      </div>

      <div className="border rounded-lg px-4 py-3 bg-card mb-5 max-w-xs">
        <p className="text-xs text-muted-foreground mb-1">Total this month</p>
        <p className="text-base font-semibold"><AedAmount amount={data?.total ?? 0} /></p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading commissions…</div>
      ) : (
        <CommissionsTable rows={data?.rows ?? []} onEdit={openEdit} />
      )}

      <CommissionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />
    </div>
  );
}
