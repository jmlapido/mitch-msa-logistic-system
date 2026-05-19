import { useState } from 'react';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useBuildings, useRentalMutations, type Building } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';

const schema = z.object({
  name: z.string().min(1), type: z.enum(['residential', 'commercial', 'mixed']),
  address: z.string().optional(), notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

export function BuildingsTab({ readonly = false }: { readonly?: boolean }) {
  const { data: buildings = [], isLoading } = useBuildings();
  const { createBuilding, updateBuilding, deleteBuilding } = useRentalMutations();
  const { user } = useAuth();
  const [editing, setEditing] = useState<Building | null>(null);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  function openAdd() { reset({}); setEditing(null); setOpen(true); }
  function openEdit(b: Building) { reset({ name: b.name, type: b.type as F['type'], address: b.address, notes: b.notes }); setEditing(b); setOpen(true); }

  async function onSubmit(values: F) {
    try {
      if (editing) { await updateBuilding.mutateAsync({ id: editing.id, ...values }); toast.success('Updated'); }
      else { await createBuilding.mutateAsync(values); toast.success('Created'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this building? All units and leases will also be deleted.')) return;
    try { await deleteBuilding.mutateAsync(id); toast.success('Deleted'); } catch { toast.error('Failed'); }
  }

  const canEdit = !readonly && (user?.role === 'admin' || user?.role === 'superadmin');

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">Buildings & Shops</h2>
        {canEdit && (
          <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Building</Button>
        )}
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map(b => (
            <div key={b.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-sm">{b.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{b.type}</div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(b)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(b.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {b.address && <p className="text-xs text-muted-foreground mt-2">{b.address}</p>}
              <div className="mt-3 flex gap-4 text-xs">
                <span className="text-muted-foreground">{b.unit_count} units</span>
                <span className="text-green-600">{b.occupied_count} occupied</span>
                <span className="text-muted-foreground">{b.unit_count - b.occupied_count} vacant</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {!readonly && (
        <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editing ? 'Edit Building' : 'Add Building'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
              <div>
                <Label>Type *</Label>
                <Select value={watch('type')} onValueChange={v => setValue('type', v as F['type'])}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Address</Label><Input {...register('address')} className="mt-1" /></div>
              <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
