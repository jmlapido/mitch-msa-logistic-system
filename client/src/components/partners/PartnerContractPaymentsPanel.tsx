import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { usePartnerMutations, type PartnerContract, type PartnerPayment } from '@/lib/hooks/usePartners';
import { formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

export function groupPaymentsByContract(payments: PartnerPayment[]): Map<number, PartnerPayment[]> {
  const map = new Map<number, PartnerPayment[]>();
  for (const p of payments) {
    const list = map.get(p.contract_id) ?? [];
    list.push(p);
    map.set(p.contract_id, list);
  }
  return map;
}

const paymentSchema = z.object({
  amount: z.string().min(1, 'Required'),
  paid_date: z.string().min(1, 'Required'),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});
type PaymentF = z.infer<typeof paymentSchema>;

type Props = {
  contract: PartnerContract;
  payments: PartnerPayment[];
  partnerId: number;
  canEdit: boolean;
};

export function PartnerContractPaymentsPanel({ contract, payments, partnerId, canEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const mutations = usePartnerMutations();

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 font-medium hover:text-foreground">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Payments
        </button>
        <div className="flex items-center gap-2 text-[10px]">
          <span>{payments.length} payment{payments.length === 1 ? '' : 's'} · <AedAmount amount={total} /></span>
          {canEdit && (
            <button onClick={() => setAddOpen(true)} className="flex items-center gap-0.5 text-primary hover:underline">
              <Plus size={11} /> Add
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-1">
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No payments recorded yet.</p>
          ) : (
            payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[11px] py-1 border-b last:border-0">
                <div className="flex flex-col">
                  <span>{formatDate(p.paid_date)} · <span className="capitalize">{p.payment_method}</span></span>
                  {p.receipt_no && <span className="text-muted-foreground">#{p.receipt_no}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {p.attachments?.map(a => (
                    <a key={a.id} href={`/api/partner-payments/${p.id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                      className="text-primary hover:text-primary/80" title={a.file_name}>
                      <Download size={11} />
                    </a>
                  ))}
                  {canEdit && p.payment_method === 'cheque' && (
                    <label className="cursor-pointer text-muted-foreground hover:text-foreground" title="Attach cheque copy">
                      📎
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try { await mutations.uploadPaymentAttachment(p.id, partnerId, file); toast.success('Uploaded'); }
                          catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Upload failed'); }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <span className="font-medium"><AedAmount amount={p.amount} /></span>
                  {canEdit && (
                    <button
                      onClick={() => {
                        if (!confirm(`Delete this payment of AED ${p.amount.toLocaleString()}? Attached receipts will also be removed.`)) return;
                        mutations.deletePayment.mutateAsync({ id: p.id, partnerId }).then(() => toast.success('Deleted')).catch((err: unknown) => { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); });
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <AddPaymentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contract={contract}
        partnerId={partnerId}
        onSave={mutations.createPayment.mutateAsync}
      />
    </div>
  );
}

function AddPaymentDialog({ open, onClose, contract, partnerId, onSave }: {
  open: boolean; onClose: () => void; contract: PartnerContract; partnerId: number;
  onSave: (d: { partnerId: number; partner_id: number; contract_id: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting } } = useForm<PaymentF>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { payment_method: 'cheque', paid_date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(v: PaymentF) {
    try {
      await onSave({
        partnerId,
        partner_id: partnerId,
        contract_id: contract.id,
        amount: Number(v.amount),
        paid_date: v.paid_date,
        payment_method: v.payment_method,
        receipt_no: v.receipt_no || undefined,
        notes: v.notes || undefined,
      });
      toast.success('Payment recorded'); reset(); onClose();
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          {contract.contract_no ? `#${contract.contract_no} · ` : ''}{formatDate(contract.start_date)} → {formatDate(contract.end_date)}
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><Label>Amount (AED) *</Label><Input {...register('amount')} type="number" min={0} step="0.01" className="mt-1" /></div>
          <div><Label>Date *</Label><Controller control={control} name="paid_date" render={({ field }) => <DateInput {...field} className="mt-1" />} /></div>
          <div>
            <Label>Method *</Label>
            <div className="flex gap-1 mt-1">
              {(['cash', 'cheque'] as const).map(m => (
                <button key={m} type="button" onClick={() => setValue('payment_method', m)}
                  className={`flex-1 text-xs py-1.5 rounded border capitalize transition-colors ${watch('payment_method') === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Receipt No.</Label><Input {...register('receipt_no')} className="mt-1" /></div>
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" placeholder="Optional" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
