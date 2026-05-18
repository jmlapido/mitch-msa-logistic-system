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
import { useProperties, usePropertyMutations, type Property } from '@/lib/hooks/useProperties';
import { useAuth } from '@/lib/hooks/useAuth';

const TYPE_LABELS: Record<string, string> = {
  villa: 'Villa',
  office: 'Office',
  shop: 'Shop',
  building: 'Building',
  other: 'Other',
};

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(['villa', 'office', 'shop', 'building', 'other']),
  address: z.string().optional(),
});
type F = z.infer<typeof schema>;

export default function Properties() {
  const { data: properties = [], isLoading } = useProperties();
  const { create, update, remove } = usePropertyMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  function openAdd() { reset({}); setEditing(null); setOpen(true); }
  function openEdit(p: Property) {
    reset({ name: p.name, type: p.type as F['type'], address: p.address });
    setEditing(p);
    setOpen(true);
  }

  async function onSubmit(v: F) {
    try {
      if (editing) { await update.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await create.mutateAsync(v); toast.success('Created'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this property?')) return;
    try { await remove.mutateAsync(id); toast.success('Deleted'); } catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">Bill-related properties (villas, offices, shops)</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Property</Button>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map(p => (
            <div key={p.id} className="border rounded-lg p-4 bg-card flex items-start justify-between">
              <div>
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 capitalize">{TYPE_LABELS[p.type] ?? p.type}</div>
                {p.address && <div className="text-xs text-muted-foreground mt-1">{p.address}</div>}
              </div>
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Property' : 'Add Property'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
            <div>
              <Label>Type *</Label>
              <Select value={watch('type')} onValueChange={v => setValue('type', v as F['type'])}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Address</Label><Input {...register('address')} className="mt-1" /></div>
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
