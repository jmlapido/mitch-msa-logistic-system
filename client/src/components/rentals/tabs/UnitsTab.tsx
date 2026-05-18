import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useUnits, useBuildings, useRentalMutations, type Unit } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { DocumentsPanel } from '../DocumentsPanel';
import { formatAED, formatDate } from '@/lib/utils';

const schema = z.object({
  building_id: z.string().min(1), unit_no: z.string().min(1),
  type: z.enum(['room', 'shop', 'apartment', 'office', 'villa']),
  floor: z.string().optional(), notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

const STATUS_STYLE: Record<string, string> = {
  occupied: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  vacant: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  expiring: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export function UnitsTab() {
  const { data: units = [], isLoading } = useUnits();
  const { data: buildings = [] } = useBuildings();
  const { createUnit, updateUnit, deleteUnit } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  const grouped = useMemo(() =>
    units.reduce<Record<number, { building_name: string; units: Unit[] }>>((acc, u) => {
      if (!acc[u.building_id]) acc[u.building_id] = { building_name: u.building_name, units: [] };
      acc[u.building_id]!.units.push(u);
      return acc;
    }, {}),
  [units]);

  function toggleCollapse(buildingId: number) {
    setCollapsed(prev => ({ ...prev, [buildingId]: !prev[buildingId] }));
  }

  function openAdd() { setEditing(null); reset({}); setOpen(true); }
  function openEdit(u: Unit) {
    setEditing(u);
    reset({ building_id: String(u.building_id), unit_no: u.unit_no, type: u.type as F['type'], floor: u.floor ?? undefined, notes: u.notes ?? undefined });
    setOpen(true);
  }

  async function onSubmit(v: F) {
    try {
      const payload = { ...v, building_id: Number(v.building_id) };
      if (editing) { await updateUnit.mutateAsync({ id: editing.id, ...payload }); toast.success('Updated'); }
      else { await createUnit.mutateAsync(payload); toast.success('Created'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this unit?')) return;
    try { await deleteUnit.mutateAsync(id); toast.success('Deleted'); if (selectedUnit?.id === id) setSelectedUnit(null); }
    catch { toast.error('Failed'); }
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Units</h2>
          <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Unit</Button>
        </div>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([buildingId, group]) => {
              const bid = Number(buildingId);
              const isOpen = !collapsed[bid];
              const occupiedCount = group.units.filter(u => u.occupancy_status === 'occupied' || u.occupancy_status === 'expiring').length;
              const vacantCount = group.units.filter(u => u.occupancy_status === 'vacant').length;
              return (
                <div key={bid} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCollapse(bid)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-muted hover:bg-muted/80 text-sm font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {group.building_name}
                    </div>
                    <div className="flex gap-2 text-xs font-medium">
                      {occupiedCount > 0 && <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">{occupiedCount} occupied</span>}
                      {vacantCount > 0 && <span className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-0.5 rounded-full">{vacantCount} vacant</span>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs">
                          <tr>
                            <th className="text-left px-3 py-2">Unit</th>
                            <th className="hidden sm:table-cell text-left px-3 py-2">Type</th>
                            <th className="text-left px-3 py-2">Tenant</th>
                            <th className="text-right px-3 py-2">Rent/mo</th>
                            <th className="hidden sm:table-cell text-left px-3 py-2">Lease End</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.units.map(u => (
                            <tr key={u.id}
                              className={`hover:bg-muted/30 cursor-pointer ${selectedUnit?.id === u.id ? 'bg-muted/50' : ''}`}
                              onClick={() => setSelectedUnit(selectedUnit?.id === u.id ? null : u)}>
                              <td className="px-3 py-2 font-medium">{u.unit_no}</td>
                              <td className="hidden sm:table-cell px-3 py-2 text-xs capitalize">{u.type}</td>
                              <td className="px-3 py-2 text-xs">{u.tenant_name ?? '—'}</td>
                              <td className="px-3 py-2 text-xs text-right">{u.monthly_rent ? formatAED(u.monthly_rent) : '—'}</td>
                              <td className="hidden sm:table-cell px-3 py-2 text-xs">{formatDate(u.lease_end)}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[u.occupancy_status] ?? ''}`}>
                                  {u.occupancy_status}
                                </span>
                              </td>
                              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-1">
                                  {user?.role === 'admin' && <>
                                    <button onClick={() => openEdit(u)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                                    <button onClick={() => handleDelete(u.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                                  </>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedUnit && (
        <div className="w-full md:w-64 md:shrink-0 border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-1">{selectedUnit.unit_no} — {selectedUnit.building_name}</h3>
          <p className="text-xs text-muted-foreground mb-3 capitalize">{selectedUnit.type} · Floor {selectedUnit.floor ?? '—'}</p>
          <DocumentsPanel entityType="unit" entityId={selectedUnit.id} />
        </div>
      )}

      <Dialog key={editing ? `edit-${editing.id}` : 'new'} open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Unit' : 'Add Unit'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Building *</Label>
              <Select value={watch('building_id')} onValueChange={v => setValue('building_id', v, { shouldValidate: true })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select building" /></SelectTrigger>
                <SelectContent>{buildings.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit No. *</Label><Input {...register('unit_no')} className="mt-1" /></div>
              <div><Label>Floor</Label><Input {...register('floor')} className="mt-1" /></div>
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={watch('type')} onValueChange={v => setValue('type', v as F['type'], { shouldValidate: true })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {['room', 'shop', 'apartment', 'office', 'villa'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
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
