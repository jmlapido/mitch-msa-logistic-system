import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useContracts, useRentalMutations, type Contract } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatAED, formatDate } from '@/lib/utils';

const schema = z.object({
  contract_no: z.string().min(1, 'Required'),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  annual_rent: z.string().min(1, 'Required'),
  no_of_pdc: z.string().min(1, 'Required'),
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

export function ContractsPanel({ tenantId }: { tenantId: number }) {
  const { data: contracts = [], isLoading } = useContracts(tenantId);
  const { createContract, updateContract, deleteContract } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [durationAmt, setDurationAmt] = useState('');
  const [durationUnit, setDurationUnit] = useState<'days' | 'months'>('months');

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting, errors } } = useForm<F>({
    resolver: zodResolver(schema),
  });

  function applyDuration() {
    const start = watch('start_date');
    const end = calcEndDate(start, durationAmt, durationUnit);
    if (end) setValue('end_date', end);
  }

  function openAdd() {
    reset({ contract_no: '', start_date: '', end_date: '', annual_rent: '', no_of_pdc: '1', notes: '' });
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
      no_of_pdc: String(c.no_of_pdc),
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
      no_of_pdc: Number(v.no_of_pdc),
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
        {user?.role === 'admin' && (
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
          {contracts.map(c => (
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
                    <p>Annual Rent: <span className="font-medium text-foreground">{formatAED(c.annual_rent)}</span></p>
                    <p>PDC: <span className="font-medium text-foreground">{c.no_of_pdc} cheque{c.no_of_pdc !== 1 ? 's' : ''}</span></p>
                    {c.notes && <p className="italic">{c.notes}</p>}
                  </div>
                </div>
                {user?.role === 'admin' && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={11} /></button>
                    <button onClick={() => handleDelete(c)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
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
                <Input {...register('start_date')} type="date" className="mt-1" />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input {...register('end_date')} type="date" className="mt-1" />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Annual Rent (AED) *</Label>
                <Input {...register('annual_rent')} type="number" min={0} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label>No. of PDC *</Label>
                <Input {...register('no_of_pdc')} type="number" min={1} max={24} className="mt-1" placeholder="1" />
              </div>
            </div>
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
