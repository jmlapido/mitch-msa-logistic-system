import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, User, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTenants, useRentalMutations, type Tenant } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import { DocumentsPanel } from '../DocumentsPanel';
import { ContractsPanel } from '../ContractsPanel';
import { formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

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
  const { createTenant, updateTenant, deleteTenant } = useRentalMutations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [expanded, setExpanded] = useState<number | null>(initialOpenId ?? null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
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

  function openAdd() { reset({ tenant_type: 'person' }); setEditing(null); setOpen(true); }
  function openEdit(t: Tenant) {
    reset({
      tenant_type: t.tenant_type ?? 'person',
      name: t.name, phone: t.phone, phone_alt: t.phone_alt, email: t.email,
      address: t.address, id_number: t.id_number, nationality: t.nationality,
      trade_license_no: t.trade_license_no, trn: t.trn,
      contact_person_name: t.contact_person_name, contact_person_phone: t.contact_person_phone,
      contact_person_email: t.contact_person_email, notes: t.notes,
    });
    setEditing(t); setOpen(true);
  }

  async function onSubmit(v: F) {
    const payload = v;
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
                            <div className="font-medium text-sm capitalize">
                              {t.name}
                              {t.tenant_type === 'company'
                                ? <Building2 size={12} className="inline ml-1 text-muted-foreground" aria-label="Company" />
                                : <User size={12} className="inline ml-1 text-muted-foreground" aria-label="Person" />}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {t.units_summary ?? 'No unit assigned'}
                              {t.phone && <span className="ml-2">{t.phone}</span>}
                            </div>
                            {(t.total_balance ?? 0) > 0 && (
                              <div className="text-xs text-red-600 font-medium"><AedAmount amount={t.total_balance!} /> total rental balance due</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {(t.annual_rent || t.monthly_rent) && (
                              <div className="text-right hidden sm:block">
                                <div className="text-sm font-semibold"><AedAmount amount={t.monthly_rent!} /><span className="text-xs font-normal text-muted-foreground">/mo</span></div>
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
                              {t.tenant_type !== 'company' && <p className="text-xs text-muted-foreground">Emirates ID: {t.id_number ?? '—'}</p>}
                              {t.tenant_type === 'person' && t.nationality && <p className="text-xs text-muted-foreground">Nationality: {t.nationality}</p>}
                              {t.tenant_type === 'company' && <>
                                {t.trade_license_no && <p className="text-xs text-muted-foreground">Trade License: {t.trade_license_no}</p>}
                                {t.trn && <p className="text-xs text-muted-foreground">TRN: {t.trn}</p>}
                                {t.contact_person_name && <p className="text-xs text-muted-foreground">Contact: {t.contact_person_name}{t.contact_person_phone ? ` · ${t.contact_person_phone}` : ''}</p>}
                              </>}
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle></DialogHeader>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
