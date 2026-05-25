import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
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
  const [receipt, setReceipt] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { updateEntry } = useBillMutations(month);
  const qc = useQueryClient();

  async function markPaid() {
    try {
      await updateEntry.mutateAsync({
        id: entry.entry_id,
        status: 'paid',
        amount: Number(amount),
        paid_date: paidDate,
        invoice_no: invoiceNo || null,
      });
      if (receipt) {
        const fd = new FormData();
        fd.append('file', receipt);
        fd.append('entry_id', String(entry.entry_id));
        const res = await fetch('/api/bill-attachments', { method: 'POST', body: fd, credentials: 'include' });
        if (!res.ok) {
          toast.error('Marked paid but receipt upload failed');
        } else {
          toast.success('Marked as paid with receipt');
          qc.invalidateQueries({ queryKey: ['bill-entries', month] });
        }
      } else {
        toast.success('Marked as paid');
      }
      setReceipt(null);
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
          <DateInput value={paidDate} onChange={setPaidDate} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Invoice / Receipt No.</Label>
          <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Optional" className="mt-1" />
        </div>
        {entry.status !== 'paid' && (
          <div>
            <Label className="text-xs">Attach Receipt</Label>
            {receipt ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                <Paperclip size={11} />
                <span className="flex-1 truncate">{receipt.name}</span>
                <button type="button" onClick={() => setReceipt(null)} className="hover:text-destructive">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-1 w-full flex items-center gap-1.5 text-xs text-muted-foreground border border-dashed rounded px-2 py-1.5 hover:border-primary hover:text-primary transition-colors"
              >
                <Paperclip size={11} /> Upload receipt
              </button>
            )}
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.docx,.xlsx"
              onChange={e => { setReceipt(e.target.files?.[0] ?? null); e.target.value = ''; }}
            />
          </div>
        )}
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
