import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/DateInput';
import { useWithdrawalMutations, type Withdrawal } from '@/lib/hooks/useWithdrawals';

const schema = z.object({
  withdrawn_by: z.string().min(1, 'Required'),
  amount: z.string().min(1, 'Required'),
  withdrawn_date: z.string().min(1, 'Required'),
  payment_method: z.enum(['cash', 'cheque']),
  cheque_number: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => d.payment_method !== 'cheque' || (d.cheque_number != null && d.cheque_number.trim().length > 0),
  { message: 'Required for cheque payments', path: ['cheque_number'] }
);

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onClose: () => void;
  editing?: Withdrawal | null;
};

function emptyValues(): FormValues {
  return { withdrawn_by: '', amount: '', withdrawn_date: '', payment_method: 'cash', cheque_number: '', notes: '' };
}

function valuesFromEditing(editing: Withdrawal): FormValues {
  return {
    withdrawn_by: editing.withdrawn_by,
    amount: String(editing.amount),
    withdrawn_date: editing.withdrawn_date,
    payment_method: editing.payment_method,
    cheque_number: editing.cheque_number ?? '',
    notes: editing.notes ?? '',
  };
}

export function WithdrawalFormModal({ open, onClose, editing }: Props) {
  const { createWithdrawal, updateWithdrawal } = useWithdrawalMutations();

  const { register, control, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing ? valuesFromEditing(editing) : emptyValues(),
  });

  useEffect(() => {
    reset(editing ? valuesFromEditing(editing) : emptyValues());
  }, [editing, reset, open]);

  const paymentMethod = watch('payment_method');

  async function onSubmit(values: FormValues) {
    const payload = {
      withdrawn_by: values.withdrawn_by,
      amount: Number(values.amount),
      withdrawn_date: values.withdrawn_date,
      payment_method: values.payment_method,
      cheque_number: values.payment_method === 'cheque' ? values.cheque_number : undefined,
      notes: values.notes || undefined,
    };
    try {
      if (editing) {
        await updateWithdrawal.mutateAsync({ id: editing.id, ...payload });
        toast.success('Withdrawal updated');
      } else {
        await createWithdrawal.mutateAsync(payload);
        toast.success('Withdrawal recorded');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Withdrawal' : 'Add Withdrawal'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Withdrawn By *</Label>
            <Input {...register('withdrawn_by')} placeholder="e.g. Boss, Son, Daughter" />
            {errors.withdrawn_by && <p className="text-xs text-destructive mt-1">{errors.withdrawn_by.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (AED) *</Label>
              <Input {...register('amount')} type="number" min={0} step="0.01" placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>}
            </div>
            <div>
              <Label>Date *</Label>
              <Controller control={control} name="withdrawn_date" render={({ field }) => (
                <DateInput {...field} />
              )} />
              {errors.withdrawn_date && <p className="text-xs text-destructive mt-1">{errors.withdrawn_date.message}</p>}
            </div>
          </div>
          <div>
            <Label>Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={v => setValue('payment_method', v as 'cash' | 'cheque')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentMethod === 'cheque' && (
            <div>
              <Label>Cheque Number *</Label>
              <Input {...register('cheque_number')} placeholder="e.g. 000123" />
              {errors.cheque_number && <p className="text-xs text-destructive mt-1">{errors.cheque_number.message}</p>}
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
