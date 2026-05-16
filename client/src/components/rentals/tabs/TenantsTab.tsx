import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTenants, useRentalMutations, type Tenant } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { DocumentsPanel } from '../DocumentsPanel';
import { formatAED, formatDate } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1), phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  id_number: z.string().optional(), notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

export function TenantsTab() {
  const { data: tenants = [], isLoading } = useTenants();
  const { createTenant, updateTenant, deleteTenant } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  function openAdd() { reset({}); setEditing(null); setOpen(true); }
  function openEdit(t: Tenant) { reset({ name: t.name, phone: t.phone, email: t.email, id_number: t.id_number, notes: t.notes }); setEditing(t); setOpen(true); }

  async function onSubmit(v: F) {
    try {
      if (editing) { await updateTenant.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await createTenant.mutateAsync(v); toast.success('Created'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this tenant?')) return;
    try { await deleteTenant.mutateAsync(id); toast.success('Deleted'); } catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">Tenants</h2>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Tenant</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <div className="space-y-1">
          {tenants.map(t => (
            <div key={t.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 hover:bg-muted/30 cursor-pointer"
                   onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                {expanded === t.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <div className="ml-2 flex-1">
                  <span className="font-medium text-sm">{t.name}</span>
                  {t.unit_no && <span className="text-xs text-muted-foreground ml-3">Unit {t.unit_no} · {t.building_name}</span>}
                  {t.monthly_rent && <span className="text-xs text-muted-foreground ml-3">{formatAED(t.monthly_rent)}/mo</span>}
                  {t.end_date && <span className="text-xs text-yellow-600 ml-3">Expires {formatDate(t.end_date)}</span>}
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  {user?.role === 'admin' && <>
                    <button onClick={() => openEdit(t)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </>}
                </div>
              </div>
              {expanded === t.id && (
                <div className="px-4 py-3 border-t bg-muted/20 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Phone: {t.phone ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">Email: {t.email ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">Emirates ID: {t.id_number ?? '—'}</p>
                    {t.notes && <p className="text-xs text-muted-foreground">Notes: {t.notes}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2">Documents</p>
                    <DocumentsPanel entityType="tenant" entityId={t.id} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
              <div><Label>Emirates ID</Label><Input {...register('id_number')} className="mt-1" /></div>
            </div>
            <div><Label>Email</Label><Input {...register('email')} type="email" className="mt-1" /></div>
            <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
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
