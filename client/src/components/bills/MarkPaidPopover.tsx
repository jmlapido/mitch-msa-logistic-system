import { useState } from 'react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBillMutations } from '@/lib/hooks/useBills';
import type { BillEntry } from '@/lib/hooks/useBills';

type Props = { entry: BillEntry; month: string };

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  unpaid: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  due_soon: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 border border-red-400',
};

export function MarkPaidPopover({ entry, month }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(entry.amount));
  const [paidDate, setPaidDate] = useState(entry.paid_date ?? new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState(entry.invoice_no ?? '');
  const { updateEntry } = useBillMutations(month);

  async function markPaid() {
    try {
      await updateEntry.mutateAsync({
        id: entry.entry_id,
        status: 'paid',
        amount: Number(amount),
        paid_date: paidDate,
        invoice_no: invoiceNo || null,
      });
      toast.success('Marked as paid');
      setOpen(false);
    } catch {
      toast.error('Failed to update');
    }
  }

  async function markUnpaid() {
    try {
      await updateEntry.mutateAsync({ id: entry.entry_id, status: 'unpaid', paid_date: null });
      toast.success('Marked as unpaid');
      setOpen(false);
    } catch {
      toast.error('Failed to update');
    }
  }

  const label = entry.computed_status === 'overdue' ? 'Overdue'
    : entry.computed_status === 'due_soon' ? 'Due Soon'
    : entry.computed_status === 'paid' ? 'Paid'
    : 'Unpaid';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer ${STATUS_STYLES[entry.computed_status] ?? ''}`}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-3">
        <p className="text-sm font-semibold">{entry.particulars}</p>
        <div>
          <Label className="text-xs">Amount (AED)</Label>
          <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" min={0} step={0.01} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Date Paid</Label>
          <Input value={paidDate} onChange={e => setPaidDate(e.target.value)} type="date" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Invoice / Receipt No.</Label>
          <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Optional" className="mt-1" />
        </div>
        <div className="flex gap-2">
          {entry.status !== 'paid' && (
            <Button size="sm" className="flex-1" onClick={markPaid} disabled={updateEntry.isPending}>
              ✓ Mark Paid
            </Button>
          )}
          {entry.status === 'paid' && (
            <Button size="sm" variant="outline" className="flex-1" onClick={markUnpaid} disabled={updateEntry.isPending}>
              Undo Paid
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
