import { useState, useEffect } from 'react';
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
import { useTenants, useUnits, useRentalMutations, type Tenant } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import { DocumentsPanel } from '../DocumentsPanel';
import { ContractsPanel } from '../ContractsPanel';
import { formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

const schema = z.object({
  name: z.string().min(1), phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  id_number: z.string().optional(), notes: z.string().optional(),
  unit_id: z.string().optional(),
});
type F = z.infer<typeof schema>;

const AVATAR_COLORS = ['#4dabf7','#74c0fc','#a9e34b','#69db7c','#ffa94d','#ff6b6b','#da77f2','#63e6be'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function LeaseStatusBadge({ tenant }: { tenant: Tenant }) {
  if (!tenant.lease_id) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">No Lease</span>;
  const daysLeft = tenant.end_date ? Math.ceil((new Date(tenant.end_date).getTime() - Date.now()) / 86400000) : Infinity;
  if (daysLeft <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Expiring</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</span>;
}

type SortKey = 'name' | 'unit' | 'expiring';

function sortTenants(list: Tenant[], key: SortKey): Tenant[] {
  return [...list].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name);
    if (key === 'unit') return (a.unit_no ?? '').localeCompare(b.unit_no ?? '', undefined, { numeric: true });
    // expiring first: no-lease last, then by end_date asc
    if (!a.end_date && !b.end_date) return 0;
    if (!a.end_date) return 1;
    if (!b.end_date) return -1;
    return a.end_date.localeCompare(b.end_date);
  });
}

function LastEditedBy({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const { data: log } = useLastAuditEntry(entityType, entityId);
  if (user?.role !== 'superadmin' || !log) return null;
  return (
    <p className="text-[10px] text-muted-foreground">
      Last edited by <span className="font-medium">{log.user_name}</span> · {new Date(log.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

export function TenantsTab({ initialOpenId }: { initialOpenId?: number }) {
  const { data: tenants = [], isLoading } = useTenants();
  const { data: units = [] } = useUnits();
  const { createTenant, updateTenant, deleteTenant } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [expanded, setExpanded] = useState<number | null>(initialOpenId ?? null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  // When deep-linked with ?tenant=id, scroll to and reveal that tenant once data loads
  useEffect(() => {
    if (!initialOpenId || !tenants.length) return;
    const tenant = tenants.find(t => t.id === initialOpenId);
    if (!tenant) return;
    // Ensure the tenant's building group is not collapsed
    const groupKey = tenant.building_name ?? 'Unassigned';
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: false }));
    // Give the DOM time to render the expanded row, then scroll
    setTimeout(() => {
      const el = document.querySelector(`[data-tenant-id="${initialOpenId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-inset');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-inset'), 2500);
      }
    }, 100);
  }, [initialOpenId, tenants]);

  const buildings = [...new Map(units.map(u => [u.building_id, { id: u.building_id, name: u.building_name }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredUnits = selectedBuildingId
    ? units.filter(u => u.building_id === Number(selectedBuildingId))
    : [];

  const grouped = tenants.reduce<Record<string, Tenant[]>>((acc, t) => {
    const key = t.building_name ?? 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(t);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped).sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  );

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function openAdd() { reset({}); setSelectedBuildingId(''); setEditing(null); setOpen(true); }
  function openEdit(t: Tenant) {
    reset({ name: t.name, phone: t.phone, email: t.email, id_number: t.id_number, notes: t.notes, unit_id: t.unit_id ? String(t.unit_id) : '' });
    const currentUnit = units.find(u => u.id === t.unit_id);
    setSelectedBuildingId(currentUnit ? String(currentUnit.building_id) : '');
    setEditing(t); setOpen(true);
  }

  async function onSubmit(v: F) {
    const payload = { ...v, unit_id: v.unit_id ? Number(v.unit_id) : null };
    try {
      if (editing) { await updateTenant.mutateAsync({ id: editing.id, ...payload }); toast.success('Updated'); }
      else { await createTenant.mutateAsync(payload); toast.success('Created'); }
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
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-xs border rounded px-2 py-1 bg-background text-foreground"
          >
            <option value="name">Sort: Name</option>
            <option value="unit">Sort: Unit</option>
            <option value="expiring">Sort: Expiring First</option>
          </select>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Tenant</Button>
          )}
        </div>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <div className="space-y-3">
          {groupKeys.map(groupKey => {
            const groupTenants = sortTenants(grouped[groupKey]!, sortKey);
            const isCollapsed = collapsedGroups[groupKey] ?? false;
            return (
              <div key={groupKey} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60 select-none"
                  onClick={() => toggleGroup(groupKey)}
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
                  <span className="text-xs font-semibold uppercase tracking-wide">{groupKey}</span>
                  <span className="text-xs text-muted-foreground ml-1">· {groupTenants.length} tenant{groupTenants.length !== 1 ? 's' : ''}</span>
                </div>
                {!isCollapsed && (
                  <div className="divide-y">
                    {groupTenants.map(t => (
                      <div key={t.id} data-tenant-id={t.id}>
                        <div
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                        >
                          {expanded === t.id ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: avatarColor(t.name) }}
                          >
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm capitalize">{t.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {t.unit_no ? `Unit ${t.unit_no}` : 'No unit assigned'}
                              {t.phone && <span className="ml-2">{t.phone}</span>}
                            </div>
                            {(t.total_balance ?? 0) > 0 && (
                              <div className="text-xs text-red-600 font-medium"><AedAmount amount={t.total_balance!} /> total rental balance due</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {(t.annual_rent || t.monthly_rent) && (
                              <div className="text-right hidden sm:block">
                                {t.payment_frequency === 'annual'
                                  ? <div className="text-sm font-semibold"><AedAmount amount={t.annual_rent!} /><span className="text-xs font-normal text-muted-foreground">/yr</span></div>
                                  : <div className="text-sm font-semibold"><AedAmount amount={t.monthly_rent!} /><span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                                }
                                {t.end_date && <div className="text-xs text-muted-foreground">until {formatDate(t.end_date)}</div>}
                              </div>
                            )}
                            <LeaseStatusBadge tenant={t} />
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              {(user?.role === 'admin' || user?.role === 'superadmin') && <>
                                <button onClick={() => openEdit(t)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                                <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                              </>}
                            </div>
                          </div>
                        </div>
                        {expanded === t.id && (
                          <div className="px-4 py-3 border-t bg-muted/20 grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs font-medium mb-2">Contact</p>
                              <p className="text-xs text-muted-foreground">Phone: {t.phone ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">Email: {t.email ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">Emirates ID: {t.id_number ?? '—'}</p>
                              {t.notes && <p className="text-xs text-muted-foreground mt-1">Notes: {t.notes}</p>}
                              <LastEditedBy entityType="tenant" entityId={t.id} />
                            </div>
                            <div><ContractsPanel tenantId={t.id} /></div>
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
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
            <div>
              <Label>Building</Label>
              <Select
                value={selectedBuildingId || 'none'}
                onValueChange={v => {
                  const bid = v === 'none' ? '' : v;
                  setSelectedBuildingId(bid);
                  setValue('unit_id', '');
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select building" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {buildings.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                value={watch('unit_id') || 'none'}
                onValueChange={v => setValue('unit_id', v === 'none' ? '' : v)}
                disabled={!selectedBuildingId}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder={selectedBuildingId ? 'Select unit' : 'Select a building first'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {filteredUnits.map(u => {
                    const isCurrentUnit = editing?.unit_id === u.id;
                    const unavailable = u.occupancy_status !== 'vacant' && !isCurrentUnit;
                    return (
                      <SelectItem key={u.id} value={String(u.id)} disabled={unavailable}>
                        {u.unit_no}
                        {u.type && <span className="text-xs text-muted-foreground ml-1 capitalize">({u.type})</span>}
                        {unavailable && <span className="text-xs text-red-500 ml-1"> · Not available</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
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
