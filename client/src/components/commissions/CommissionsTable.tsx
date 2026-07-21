import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AedAmount } from '@/components/ui/AedAmount';
import { formatDate } from '@/lib/utils';
import { useCommissionMutations, type Commission } from '@/lib/hooks/useCommissions';

type Props = {
  rows: Commission[];
  onEdit: (row: Commission) => void;
};

export function CommissionsTable({ rows, onEdit }: Props) {
  const { deleteCommission } = useCommissionMutations();

  async function handleDelete(row: Commission) {
    if (!confirm(`Delete this commission of AED ${row.amount.toLocaleString()} from ${row.name}?`)) return;
    try {
      await deleteCommission.mutateAsync(row.id);
      toast.success('Commission deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  if (rows.length === 0) {
    return <p className="text-center py-12 text-muted-foreground">No commissions recorded for this month.</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2 pr-3">Name</th>
          <th className="py-2 pr-3">Amount</th>
          <th className="py-2 pr-3">Date</th>
          <th className="py-2 pr-3">Method</th>
          <th className="py-2 pr-3">Notes</th>
          <th className="py-2 pr-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className="border-b last:border-0">
            <td className="py-2 pr-3">{row.name}</td>
            <td className="py-2 pr-3"><AedAmount amount={row.amount} /></td>
            <td className="py-2 pr-3">{formatDate(row.paid_date)}</td>
            <td className="py-2 pr-3 capitalize">
              {row.payment_method}
              {row.payment_method === 'cheque' && row.cheque_number && (
                <span className="text-muted-foreground"> · #{row.cheque_number}</span>
              )}
            </td>
            <td className="py-2 pr-3 text-muted-foreground">{row.notes ?? '—'}</td>
            <td className="py-2 pr-3 text-right">
              <div className="inline-flex gap-1">
                <button onClick={() => onEdit(row)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(row)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
