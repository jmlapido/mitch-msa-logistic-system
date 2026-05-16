import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/lib/hooks/useCategories';
import { useProperties } from '@/lib/hooks/useProperties';
import { useBillMutations } from '@/lib/hooks/useBills';
import type { BillTemplate } from '@/lib/hooks/useBills';

const schema = z.object({
  category_id: z.string().min(1, 'Required'),
  property_id: z.string().optional(),
  particulars: z.string().min(1, 'Required').max(100),
  account_no: z.string().optional(),
  due_day: z.string().optional(),
  is_recurring: z.boolean().default(true),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onClose: () => void;
  editing?: BillTemplate | null;
  month: string;
};

export function BillFormModal({ open, onClose, editing, month }: Props) {
  const { data: categories = [] } = useCategories();
  const { data: properties = [] } = useProperties();
  const { createTemplate, updateTemplate } = useBillMutations(month);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { is_recurring: true },
  });

  useEffect(() => {
    if (editing) {
      reset({
        category_id: String(editing.category_id),
        property_id: editing.property_id ? String(editing.property_id) : '',
        particulars: editing.particulars,
        account_no: editing.account_no ?? '',
        due_day: editing.due_day ? String(editing.due_day) : '',
        is_recurring: editing.is_recurring === 1,
        notes: editing.notes ?? '',
      });
    } else {
      reset({ is_recurring: true });
    }
  }, [editing, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      category_id: Number(values.category_id),
      property_id: values.property_id ? Number(values.property_id) : null,
      particulars: values.particulars,
      account_no: values.account_no || null,
      due_day: values.due_day ? Number(values.due_day) : null,
      is_recurring: values.is_recurring ? 1 : 0,
      notes: values.notes || null,
    };
    try {
      if (editing) {
        await updateTemplate.mutateAsync({ id: editing.id, ...payload });
        toast.success('Bill updated');
      } else {
        await createTemplate.mutateAsync(payload);
        toast.success('Bill created');
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
          <DialogTitle>{editing ? 'Edit Bill' : 'Add Bill'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Category *</Label>
            <Select value={watch('category_id')} onValueChange={v => setValue('category_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_id && <p className="text-xs text-destructive mt-1">{errors.category_id.message}</p>}
          </div>
          <div>
            <Label>Property</Label>
            <Select value={watch('property_id') ?? ''} onValueChange={v => setValue('property_id', v)}>
              <SelectTrigger><SelectValue placeholder="No property" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Particulars *</Label>
            <Input {...register('particulars')} placeholder="e.g. FEWA, DU Mobile" />
            {errors.particulars && <p className="text-xs text-destructive">{errors.particulars.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account No.</Label>
              <Input {...register('account_no')} placeholder="Optional" />
            </div>
            <div>
              <Label>Due Day (1–28)</Label>
              <Input {...register('due_day')} type="number" min={1} max={28} placeholder="e.g. 1" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
