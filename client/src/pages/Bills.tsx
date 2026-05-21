import { useState, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BillsTable } from '@/components/bills/BillsTable';
import { TotalsSidebar } from '@/components/bills/TotalsSidebar';
import { BillFormModal } from '@/components/bills/BillFormModal';
import { useBillEntries } from '@/lib/hooks/useBills';
import { currentMonth, monthLabel, formatAED } from '@/lib/utils';
import type { BillTemplate } from '@/lib/hooks/useBills';

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border rounded-lg px-4 py-3 bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}

export default function Bills() {
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const initialStatusFilter = useRef<string>((statusParam === 'paid' || statusParam === 'unpaid') ? statusParam : 'all');
  const highlightEntryId = useRef<number | null>(Number(searchParams.get('highlight')) || null);
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BillTemplate | null>(null);
  const { data: entries = [], isLoading } = useBillEntries(month);

  const grand = useMemo(() => {
    let total = 0, paid = 0, unpaid = 0;
    for (const e of entries) {
      total += e.amount;
      if (e.status === 'paid') paid += e.amount; else unpaid += e.amount;
    }
    return { total, paid, unpaid };
  }, [entries]);

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function openAdd() { setEditingTemplate(null); setModalOpen(true); }
  function openEdit(t: BillTemplate) { setEditingTemplate(t); setModalOpen(true); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
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

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Total" value={formatAED(grand.total)} />
        <StatCard label="Paid" value={formatAED(grand.paid)} valueClass="text-green-600 dark:text-green-400" />
        <StatCard label="Unpaid" value={formatAED(grand.unpaid)} valueClass={grand.unpaid > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bills…</div>
      ) : (
        <div className="flex flex-col-reverse gap-6 md:flex-row">
          <div className="flex-1 min-w-0">
            <BillsTable
              entries={entries}
              month={month}
              onEdit={openEdit}
              initialStatusFilter={initialStatusFilter.current}
              highlightEntryId={highlightEntryId.current}
            />
          </div>
          <TotalsSidebar entries={entries} month={month} />
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
