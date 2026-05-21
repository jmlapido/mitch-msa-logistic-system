import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/lib/hooks/useCategories';
import { useBillMutations } from '@/lib/hooks/useBills';
import { useBuildings } from '@/lib/hooks/useRentals';
import { monthLabel } from '@/lib/utils';
import type { BillTemplate } from '@/lib/hooks/useBills';
import { useQueryClient } from '@tanstack/react-query';

const schema = z.object({
  category_id: z.string().min(1, 'Required'),
  particulars: z.string().min(1, 'Required').max(100),
  account_no: z.string().optional(),
  due_day: z.string().optional(),
  is_recurring: z.boolean().default(true),
  notes: z.string().optional(),
  amount: z.string().optional(),
  building_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onClose: () => void;
  editing?: BillTemplate | null;
  month: string;
};

export function BillFormModal({ open, onClose, editing, month }: Props) {
  const { data: categories = [], isSuccess: categoriesReady } = useCategories();
  const { createTemplate, updateTemplate, updateEntry } = useBillMutations(month);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing ? {
      category_id: String(editing.category_id),
      particulars: editing.particulars,
      account_no: editing.account_no ?? '',
      due_day: editing.due_day ? String(editing.due_day) : '',
      is_recurring: editing.is_recurring === 1,
      notes: editing.notes ?? '',
      amount: editing.amount != null ? String(editing.amount) : '',
      building_id: editing.building_id ? String(editing.building_id) : undefined,
    } : { is_recurring: true, amount: '' },
  });

  useEffect(() => {
    if (editing) {
      reset({
        category_id: String(editing.category_id),
        particulars: editing.particulars,
        account_no: editing.account_no ?? '',
        due_day: editing.due_day ? String(editing.due_day) : '',
        is_recurring: editing.is_recurring === 1,
        notes: editing.notes ?? '',
        amount: editing.amount != null ? String(editing.amount) : '',
        building_id: editing.building_id ? String(editing.building_id) : undefined,
      });
    } else {
      reset({ is_recurring: true, amount: '' });
    }
    setPendingFile(null);
  }, [editing, reset]);

  const { data: buildings = [] } = useBuildings();
  const selectedCategoryId = watch('category_id');
  const selectedCategory = categories.find(c => String(c.id) === selectedCategoryId);
  const showBuildingPicker = selectedCategory?.links_to_building === 1;

  useEffect(() => {
    if (!categoriesReady) return;
    if (!showBuildingPicker) setValue('building_id', undefined);
  }, [showBuildingPicker, setValue, categoriesReady]);

  async function onSubmit(values: FormValues) {
    const billPayload = {
      category_id: Number(values.category_id),
      particulars: values.particulars,
      account_no: values.account_no || null,
      due_day: values.due_day ? Number(values.due_day) : null,
      is_recurring: values.is_recurring ? 1 : 0,
      notes: values.notes || null,
      building_id: values.building_id ? Number(values.building_id) : null,
    };
    try {
      if (editing) {
        await updateTemplate.mutateAsync({ id: editing.id, ...billPayload });
        if (editing.entry_id && values.amount !== '') {
          await updateEntry.mutateAsync({ id: editing.entry_id, amount: Number(values.amount) });
        }
        toast.success('Bill updated');
      } else {
        const result = await createTemplate.mutateAsync({
          ...billPayload,
          amount: values.amount ? Number(values.amount) : 0,
          month,
        });
        if (pendingFile && result?.entry_id) {
          const fd = new FormData();
          fd.append('file', pendingFile);
          fd.append('entry_id', String(result.entry_id));
          const res = await fetch('/api/bill-attachments', { method: 'POST', body: fd, credentials: 'include' });
          if (!res.ok) toast.error('File upload failed');
          else toast.success('Bill created with attachment');
        } else {
          toast.success('Bill created');
        }
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  const isRecurring = watch('is_recurring');

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Bill' : 'Add Bill'}</DialogTitle>
          <p className="text-sm text-muted-foreground">{monthLabel(month)}</p>
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
          {showBuildingPicker && (
            <div>
              <Label>Building</Label>
              <Select
                value={watch('building_id') ?? 'none'}
                onValueChange={v => setValue('building_id', v === 'none' ? undefined : v)}
              >
                <SelectTrigger><SelectValue placeholder="None / General" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / General</SelectItem>
                  {buildings.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Particulars *</Label>
            <Input {...register('particulars')} placeholder="e.g. FEWA, DU Mobile" />
            {errors.particulars && <p className="text-xs text-destructive">{errors.particulars.message}</p>}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_recurring"
              checked={isRecurring}
              onChange={e => {
                const checked = e.target.checked;
                setValue('is_recurring', checked);
                const currentDay = watch('due_day');
                if (checked && currentDay && Number(currentDay) > 28) {
                  setValue('due_day', undefined);
                }
              }}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            <label htmlFor="is_recurring" className="text-sm cursor-pointer select-none">
              Recurring — due date repeats every month
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account No.</Label>
              <Input {...register('account_no')} placeholder="Optional" />
            </div>
            <div>
              <Label>Due Date {isRecurring && <span className="text-xs text-muted-foreground">(repeats monthly)</span>}</Label>
              <Select value={watch('due_day') ?? 'none'} onValueChange={v => setValue('due_day', v === 'none' ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No due date</SelectItem>
                  {Array.from({ length: isRecurring ? 28 : 31 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>
                      {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of month
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Amount (AED)</Label>
            <Input {...register('amount')} type="number" min={0} step="0.01" placeholder="0.00" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...register('notes')} />
          </div>
          {!editing && pendingFile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded px-2 py-1">
              <Paperclip size={12} />
              <span className="flex-1 truncate">{pendingFile.name}</span>
              <button type="button" onClick={() => setPendingFile(null)} className="hover:text-destructive">
                <X size={12} />
              </button>
            </div>
          )}
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.docx,.xlsx"
            onChange={e => { setPendingFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {!editing && (
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} className="mr-1.5" /> Attach Bill/Invoice
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
