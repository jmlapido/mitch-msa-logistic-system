import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BillsTable } from '@/components/bills/BillsTable';
import { TotalsSidebar } from '@/components/bills/TotalsSidebar';
import { BillFormModal } from '@/components/bills/BillFormModal';
import { useBillEntries } from '@/lib/hooks/useBills';
import { currentMonth, monthLabel } from '@/lib/utils';
import type { BillTemplate } from '@/lib/hooks/useBills';

export default function Bills() {
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BillTemplate | null>(null);
  const { data: entries = [], isLoading } = useBillEntries(month);

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function openAdd() { setEditingTemplate(null); setModalOpen(true); }
  function openEdit(t: BillTemplate) { setEditingTemplate(t); setModalOpen(true); }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => changeMonth(-1)} className="hover:text-primary"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium">{monthLabel(month)}</span>
            <button onClick={() => changeMonth(1)} className="hover:text-primary"><ChevronRight size={16} /></button>
          </div>
        </div>
        <Button onClick={openAdd} size="sm"><Plus size={14} className="mr-1" /> Add Bill</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bills…</div>
      ) : (
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <BillsTable entries={entries} month={month} onEdit={openEdit} />
          </div>
          <TotalsSidebar entries={entries} />
        </div>
      )}

      <BillFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingTemplate}
        month={month}
      />
    </div>
  );
}
