import { useState, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
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

export function BillsTable({ entries, month, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const { deleteTemplate } = useBillMutations(month);
  const { user } = useAuth();

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return entries.filter(e => { const k = e.category_name; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [entries]);

  const filtered = useMemo(() => entries.filter(e => {
    if (search && !`${e.particulars} ${e.property_name ?? ''} ${e.account_no ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && e.computed_status !== statusFilter) return false;
    if (catFilter !== 'all' && e.category_name !== catFilter) return false;
    return true;
  }), [entries, search, statusFilter, catFilter]);

  async function handleDelete(billId: number) {
    if (!confirm('Delete this bill and all its history?')) return;
    try {
      await deleteTemplate.mutateAsync(billId);
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  }

  const CHIPS: { label: string; value: string }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Due Soon', value: 'due_soon' },
    { label: 'Overdue', value: 'overdue' },
    { label: 'Paid', value: 'paid' },
  ];

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
        <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-40 h-7 text-xs ml-auto" />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Category</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Property</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Particulars</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Acct No.</th>
              <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wide">Amount</th>
              <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Due</th>
              <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Status</th>
              <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wide">Files</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(entry => (
              <tr key={entry.entry_id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: entry.category_color + '22', color: entry.category_color }}>
                    {entry.category_icon} {entry.category_name}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">{entry.property_name ?? '—'}</td>
                <td className="px-3 py-2 text-sm font-medium">{entry.particulars}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{entry.account_no ?? '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatAED(entry.amount)}</td>
                <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                  {entry.due_day ? `${entry.due_day}th` : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  <MarkPaidPopover entry={entry} month={month} />
                </td>
                <td className="px-3 py-2 text-center">
                  <AttachmentCell entry={entry} month={month} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit({ id: entry.bill_id, category_id: entry.category_id, property_id: entry.property_id, particulars: entry.particulars, account_no: entry.account_no, due_day: entry.due_day, is_recurring: 1, notes: null, category_name: entry.category_name, category_color: entry.category_color, category_icon: entry.category_icon, property_name: entry.property_name })}
                      className="text-muted-foreground hover:text-foreground p-1">
                      <Pencil size={13} />
                    </button>
                    {user?.role === 'admin' && (
                      <button onClick={() => handleDelete(entry.bill_id)}
                        className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">No bills found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} of {entries.length} bills shown</p>
    </div>
  );
}
