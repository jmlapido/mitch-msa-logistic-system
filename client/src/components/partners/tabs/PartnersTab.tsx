import { useState } from 'react';
import { Plus, Pencil, Trash2, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { usePartners, usePartnerMutations, type Partner } from '@/lib/hooks/usePartners';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatAED, formatDate } from '@/lib/utils';
import { PartnerModal } from '../PartnerModal';

const schema = z.object({
  company_name: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
});
type F = z.infer<typeof schema>;

const STATUS_STYLE: Record<string, string> = {
  paid:        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue:     'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending:     'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  no_contract: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', overdue: 'Overdue', pending: 'Pending', no_contract: 'No Contract',
};

export function PartnersTab() {
  const { data: partners = [], isLoading } = usePartners();
  const { createPartner, updatePartner, deletePartner } = usePartnerMutations();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [detail, setDetail] = useState<Partner | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'collected' | 'status'>('name');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<F>({ resolver: zodResolver(schema) });

  function openAdd() { reset({ company_name: '', phone: '', email: '', notes: '' }); setEditing(null); setOpen(true); }
  function openEdit(p: Partner) { reset({ company_name: p.company_name, phone: p.phone ?? '', email: p.email ?? '', notes: p.notes ?? '' }); setEditing(p); setOpen(true); }

  async function onSubmit(v: F) {
    try {
      if (editing) { await updatePartner.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await createPartner.mutateAsync(v); toast.success('Partner added'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(p: Partner) {
    if (!confirm(`Delete ${p.company_name}? All contacts, contracts, payments and documents will be deleted.`)) return;
    try { await deletePartner.mutateAsync(p.id); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  }

  const filtered = partners
    .filter(p => {
      const matchSearch = p.company_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.company_name.localeCompare(b.company_name);
      if (sortBy === 'collected') return b.total_paid - a.total_paid;
      const order: Record<string, number> = { overdue: 0, partial: 1, pending: 2, paid: 3, no_contract: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search partners…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs w-48"
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="name">Sort: Name A–Z</option>
            <option value="collected">Sort: Total Collected</option>
            <option value="status">Sort: Status</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
            <option value="no_contract">No Contract</option>
          </select>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Partner</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No partners found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => setDetail(p)}
              className={`border rounded-lg p-4 bg-card cursor-pointer hover:shadow-sm transition-shadow ${
                p.status === 'overdue' ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Handshake size={16} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.company_name}</div>
                    {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1">
                {p.total_paid > 0 && (
                  <p className="text-xs font-semibold text-green-600">{formatAED(p.total_paid)} collected</p>
                )}
                {p.contract_end && (
                  <p className="text-xs text-muted-foreground">
                    Contract expires {formatDate(p.contract_end)}
                  </p>
                )}
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[p.status] ?? ''}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Partner' : 'Add Partner'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Company Name *</Label>
              <Input {...register('company_name')} className="mt-1" />
              {errors.company_name && <p className="text-xs text-destructive mt-0.5">{errors.company_name.message}</p>}
            </div>
            <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
            <div>
              <Label>Email</Label>
              <Input {...register('email')} type="email" className="mt-1" />
              {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email.message}</p>}
            </div>
            <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      {detail && (
        <PartnerModal
          partner={detail}
          open={!!detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
