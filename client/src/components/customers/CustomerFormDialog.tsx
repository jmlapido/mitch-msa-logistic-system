import { useEffect } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useRentalMutations, type Tenant } from '@/lib/hooks/useRentals';

const schema = z.object({
  tenant_type: z.enum(['person', 'company']),
  name: z.string().min(1),
  phone: z.string().optional(),
  phone_alt: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  id_number: z.string().optional(),
  nationality: z.string().optional(),
  trade_license_no: z.string().optional(),
  trn: z.string().optional(),
  contact_person_name: z.string().optional(),
  contact_person_phone: z.string().optional(),
  contact_person_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

export function CustomerFormDialog({ open, editing, onClose }: { open: boolean; editing: Tenant | null; onClose: () => void }) {
  const { createTenant, updateTenant } = useRentalMutations();
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      reset({
        tenant_type: editing.tenant_type ?? 'person',
        name: editing.name, phone: editing.phone, phone_alt: editing.phone_alt, email: editing.email,
        address: editing.address, id_number: editing.id_number, nationality: editing.nationality,
        trade_license_no: editing.trade_license_no, trn: editing.trn,
        contact_person_name: editing.contact_person_name, contact_person_phone: editing.contact_person_phone,
        contact_person_email: editing.contact_person_email, notes: editing.notes,
      });
    } else {
      reset({ tenant_type: 'person' });
    }
    // Keyed on editing?.id (not the object) so a background refetch that
    // replaces the row identity doesn't wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, reset]);

  async function onSubmit(v: F) {
    try {
      if (editing) { await updateTenant.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await createTenant.mutateAsync(v); toast.success('Created'); }
      onClose();
    } catch { toast.error('Failed'); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Type *</Label>
            <Select value={watch('tenant_type')} onValueChange={v => setValue('tenant_type', v as 'person' | 'company')}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="person">Person</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{watch('tenant_type') === 'company' ? 'Company Name *' : 'Full Name *'}</Label><Input {...register('name')} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
            <div><Label>Alt. Phone</Label><Input {...register('phone_alt')} className="mt-1" /></div>
          </div>
          <div><Label>Email</Label><Input {...register('email')} type="email" className="mt-1" /></div>
          <div><Label>Address</Label><Input {...register('address')} className="mt-1" /></div>
          {watch('tenant_type') === 'company' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Trade License No.</Label><Input {...register('trade_license_no')} className="mt-1" /></div>
                <div><Label>TRN</Label><Input {...register('trn')} className="mt-1" /></div>
              </div>
              <div className="border rounded p-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Contact Person</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name</Label><Input {...register('contact_person_name')} className="mt-1" /></div>
                  <div><Label>Phone</Label><Input {...register('contact_person_phone')} className="mt-1" /></div>
                </div>
                <div><Label>Email</Label><Input {...register('contact_person_email')} type="email" className="mt-1" /></div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emirates ID</Label><Input {...register('id_number')} className="mt-1" /></div>
              <div><Label>Nationality</Label><Input {...register('nationality')} className="mt-1" /></div>
            </div>
          )}
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
