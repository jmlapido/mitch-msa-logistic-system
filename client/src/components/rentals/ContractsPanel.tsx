import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useContracts, useRentalMutations, type Contract } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import { formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';
import { PaymentSchedulePanel } from './PaymentSchedulePanel';

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-annual',
  annual: 'Annual',
  custom: 'Custom',
};

const FREQ_COUNTS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
  custom: 0,
};

const schema = z.object({
  contract_no: z.string().min(1, 'Required'),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  annual_rent: z.string().min(1, 'Required'),
  payment_type: z.enum(['cash', 'pdc']),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual', 'custom']),
  notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

function calcEndDate(startDate: string, amount: string, unit: 'days' | 'months'): string {
  if (!startDate || !amount || Number(amount) <= 0) return '';
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return '';
  const n = Number(amount);
  if (unit === 'days') d.setDate(d.getDate() + n);
  else d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function LastEditedBy({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const { data: log } = useLastAuditEntry(entityType, entityId);
  if (user?.role !== 'superadmin' || !log) return null;
  return (
    <p className="text-[10px] text-muted-foreground mt-1">
      Last edited by <span className="font-medium">{log.user_name}</span> · {new Date(log.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

export function ContractsPanel({ tenantId }: { tenantId: number }) {
  const { data: contracts = [], isLoading } = useContracts(tenantId);
  const { createContract, updateContract, deleteContract } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [durationAmt, setDurationAmt] = useState('');
  const [durationUnit, setDurationUnit] = useState<'days' | 'months'>('months');

  const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting, errors } } = useForm<F>({
    resolver: zodResolver(schema),
  });

  function applyDuration() {
    const start = watch('start_date');
    const end = calcEndDate(start, durationAmt, durationUnit);
    if (end) setValue('end_date', end);
  }

  function openAdd() {
    reset({
      contract_no: '', start_date: '', end_date: '', annual_rent: '',
      payment_type: 'pdc', payment_frequency: 'monthly', notes: '',
    });
    setDurationAmt('');
    setEditing(null);
    setOpen(true);
  }

  function openEdit(c: Contract) {
    reset({
      contract_no: c.contract_no,
      start_date: c.start_date,
      end_date: c.end_date,
      annual_rent: String(c.annual_rent),
      payment_type: c.payment_type ?? 'pdc',
      payment_frequency: c.payment_frequency ?? 'monthly',
      notes: c.notes ?? '',
    });
    setDurationAmt('');
    setEditing(c);
    setOpen(true);
  }

  async function onSubmit(v: F) {
    const payload = {
      tenant_id: tenantId,
      contract_no: v.contract_no,
      start_date: v.start_date,
      end_date: v.end_date,
      annual_rent: Number(v.annual_rent),
      payment_type: v.payment_type,
      payment_frequency: v.payment_frequency,
      notes: v.notes || undefined,
    };
    try {
      if (editing) {
        await updateContract.mutateAsync({ id: editing.id, ...payload });
        toast.success('Contract updated');
      } else {
        await createContract.mutateAsync(payload);
        toast.success('Contract added');
      }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(c: Contract) {
    if (!confirm('Delete this contract?')) return;
    try {
      await deleteContract.mutateAsync({ id: c.id, tenantId });
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium">Contracts</p>
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <button onClick={openAdd} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus size={11} /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No contracts yet</p>
      ) : (
        <div className="space-y-1.5">
          {contracts.map(c => {
            const freq = c.payment_frequency ?? 'monthly';
            const freqLabel = FREQ_LABELS[freq] ?? freq;
            const slotCount = freq === 'custom' ? null : FREQ_COUNTS[freq];
            return (
              <div key={c.id} className="border rounded p-2 bg-background text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold truncate">#{c.contract_no}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        c.status === 'valid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {c.status === 'valid' ? 'Valid' : 'Expired'}
                      </span>
                    </div>
                    <div className="text-muted-foreground space-y-0.5">
                      <p>{formatDate(c.start_date)} → {formatDate(c.end_date)}</p>
                      <p>Annual Rent: <span className="font-medium text-foreground"><AedAmount amount={c.annual_rent} /></span></p>
                      <p>
                        Frequency:{' '}
                        <span className="font-medium text-foreground">
                          {freqLabel}{slotCount !== null ? ` (${slotCount} payment${slotCount !== 1 ? 's' : ''})` : ''}
                        </span>
                      </p>
                      <p>
                        Type:{' '}
                        <span className="font-medium text-foreground">
                          {(c.payment_type ?? 'pdc') === 'pdc' ? 'PDC' : 'Cash'}
                        </span>
                      </p>
                      {c.notes && <p className="italic">{c.notes}</p>}
                      <LastEditedBy entityType="contract" entityId={c.id} />
                    </div>
                  </div>
                  {(user?.role === 'admin' || user?.role === 'superadmin') && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={11} /></button>
                      <button onClick={() => handleDelete(c)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
                    </div>
                  )}
                </div>
                <PaymentSchedulePanel
                  contractId={c.id}
                  paymentFrequency={freq}
                  paymentType={c.payment_type ?? 'pdc'}
                  startDate={c.start_date}
                  slotCount={c.no_of_pdc}
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Contract' : 'Add Contract'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Contract No. *</Label>
              <Input {...register('contract_no')} className="mt-1" placeholder="e.g. CTR-2024-001" />
              {errors.contract_no && <p className="text-xs text-destructive">{errors.contract_no.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Controller control={control} name="start_date" render={({ field }) => (
                  <DateInput {...field} className="mt-1" />
                )} />
                {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
              </div>
              <div>
                <Label>End Date *</Label>
                <Controller control={control} name="end_date" render={({ field }) => (
                  <DateInput {...field} className="mt-1" />
                )} />
                {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Duration helper — fills End Date from Start Date</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number" min={1} placeholder="e.g. 12"
                  value={durationAmt} onChange={e => setDurationAmt(e.target.value)}
                  className="w-24"
                />
                <Select value={durationUnit} onValueChange={v => setDurationUnit(v as 'days' | 'months')}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={applyDuration}>Apply</Button>
              </div>
            </div>
            <div>
              <Label>Annual Rent (AED) *</Label>
              <Input {...register('annual_rent')} type="number" min={0} className="mt-1" placeholder="0" />
            </div>
            <div>
              <Label>Payment Frequency *</Label>
              <Select
                value={watch('payment_frequency')}
                onValueChange={v => setValue('payment_frequency', v as F['payment_frequency'])}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly (12 payments/year)</SelectItem>
                  <SelectItem value="quarterly">Quarterly (4 payments/year)</SelectItem>
                  <SelectItem value="semi-annual">Semi-annual (2 payments/year)</SelectItem>
                  <SelectItem value="annual">Annual (1 lump sum/year)</SelectItem>
                  <SelectItem value="custom">Custom (set dates manually)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Type *</Label>
              <Select value={watch('payment_type')} onValueChange={v => setValue('payment_type', v as 'cash' | 'pdc')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdc">PDC (Post-Dated Cheques)</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {watch('payment_frequency') === 'custom' && (
              <p className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                Payment dates are set manually in the schedule panel after saving the contract.
              </p>
            )}
            <div>
              <Label>Notes</Label>
              <Input {...register('notes')} className="mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
