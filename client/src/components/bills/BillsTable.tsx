import { useState, useMemo } from 'react';
import { Pencil, Trash2, RefreshCw, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { MarkPaidPopover } from './MarkPaidPopover';
import { AttachmentCell } from './AttachmentCell';
import { formatAED } from '@/lib/utils';
import { useBillMutations, type BillEntry, type BillTemplate } from '@/lib/hooks/useBills';
import { useAuth } from '@/lib/hooks/useAuth';

type Props = {
  entries: BillEntry[];
  month: string;
  onEdit: (template: BillTemplate) => void;
};

const CHIPS = [
  { label: 'All', value: 'all' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Due Soon', value: 'due_soon' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid', value: 'paid' },
];

const COL_COUNT = 8;

function GroupHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <tr className="bg-muted/60 border-y border-border">
      <td colSpan={COL_COUNT} className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {icon}
          {label}
          <span className="ml-1 font-normal normal-case">({count})</span>
        </div>
      </td>
    </tr>
  );
}

export function BillsTable({ entries, month, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const { deleteTemplate } = useBillMutations(month);
  const { user } = useAuth();

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return entries.filter(e => { const k = e.category_name; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [entries]);

  const buildingOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of entries) {
      if (e.building_id && e.building_name && !seen.has(e.building_id)) {
        seen.set(e.building_id, e.building_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const filtered = useMemo(() => entries.filter(e => {
    if (search && !`${e.particulars} ${e.account_no ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && e.computed_status !== statusFilter) return false;
    if (catFilter !== 'all' && e.category_name !== catFilter) return false;
    if (buildingFilter !== 'all' && String(e.building_id ?? '') !== buildingFilter) return false;
    return true;
  }), [entries, search, statusFilter, catFilter, buildingFilter]);

  const recurring = useMemo(() => filtered.filter(e => e.is_recurring === 1), [filtered]);
  const oneTime   = useMemo(() => filtered.filter(e => e.is_recurring !== 1), [filtered]);

  async function handleDelete(billId: number) {
    if (!confirm('Delete this bill and all its history?')) return;
    try {
      await deleteTemplate.mutateAsync(billId);
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  }

  function toTemplate(e: BillEntry): BillTemplate {
    return {
      id: e.bill_id,
      category_id: e.category_id,
      particulars: e.particulars,
      account_no: e.account_no,
      due_day: e.due_day,
      is_recurring: e.is_recurring,
      notes: null,
      category_name: e.category_name,
      category_color: e.category_color,
      category_icon: e.category_icon,
      entry_id: e.entry_id,
      amount: e.amount,
      building_id: e.building_id,
      building_name: e.building_name,
    };
  }

  function ordinal(n: number) {
    if (n === 11 || n === 12 || n === 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  function BillRow({ entry }: { entry: BillEntry }) {
    return (
      <tr key={entry.entry_id} className="hover:bg-muted/30 transition-colors">
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: entry.category_color + '22', color: entry.category_color }}>
            {entry.category_icon} {entry.category_name}
          </span>
        </td>
        <td className="px-3 py-2 text-sm font-medium">{entry.particulars}</td>
        <td className="hidden sm:table-cell px-3 py-2 text-xs text-muted-foreground">{entry.account_no ?? '—'}</td>
        <td className="px-3 py-2 text-right font-semibold">{formatAED(entry.amount)}</td>
        <td className="hidden sm:table-cell px-3 py-2 text-center text-xs text-muted-foreground">
          {entry.due_day ? ordinal(entry.due_day) : '—'}
        </td>
        <td className="px-3 py-2 text-center">
          <MarkPaidPopover entry={entry} month={month} />
        </td>
        <td className="px-3 py-2 text-center">
          <AttachmentCell entry={entry} month={month} />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <button onClick={() => onEdit(toTemplate(entry))}
              className="text-muted-foreground hover:text-foreground p-1">
              <Pencil size={13} />
            </button>
            {(user?.role === 'admin' || user?.role === 'superadmin') && (
              <button onClick={() => handleDelete(entry.bill_id)}
                className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {CHIPS.map(c => (
          <button key={c.value} onClick={() => setStatusFilter(c.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === c.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
            {c.label}
          </button>
        ))}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded border bg-background border-border">
          <option value="all">All categories</option>
          {categories.map(e => <option key={e.category_name} value={e.category_name}>{e.category_icon} {e.category_name}</option>)}
        </select>
        <select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded border bg-background border-border">
          <option value="all">All buildings</option>
          {buildingOptions.map(b => (
            <option key={b.id} value={String(b.id)}>{b.name}</option>
          ))}
        </select>
        <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-40 h-7 text-xs ml-auto" />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Category</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Particulars</th>
              <th className="hidden sm:table-cell text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Acct No.</th>
              <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wide">Amount</th>
              <th className="hidden sm:table-cell text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Due</th>
              <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Status</th>
              <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Invoice</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>

          {recurring.length > 0 && (
            <tbody className="divide-y divide-border">
              <GroupHeader icon={<RefreshCw size={11} />} label="Recurring" count={recurring.length} />
              {recurring.map(e => <BillRow key={e.entry_id} entry={e} />)}
            </tbody>
          )}

          {oneTime.length > 0 && (
            <tbody className="divide-y divide-border">
              <GroupHeader icon={<Hash size={11} />} label="One-time" count={oneTime.length} />
              {oneTime.map(e => <BillRow key={e.entry_id} entry={e} />)}
            </tbody>
          )}

          {filtered.length === 0 && (
            <tbody>
              <tr><td colSpan={COL_COUNT} className="text-center py-8 text-muted-foreground text-sm">No bills found</td></tr>
            </tbody>
          )}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} of {entries.length} bills shown</p>
    </div>
  );
}
