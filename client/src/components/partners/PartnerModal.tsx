import { useState, useEffect } from 'react';
import { Plus, Trash2, Phone, Mail, FileText, Download, Pencil, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  usePartnerContacts, usePartnerContracts, usePartnerPaymentsByPartner,
  usePartnerDocuments, usePartnerMutations, type Partner, type PartnerContact, type PartnerContract,
} from '@/lib/hooks/usePartners';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

const contactSchema = z.object({
  name: z.string().min(1, 'Required'),
  position: z.string().optional(),
  phone: z.string().optional(),
});

const contractSchema = z.object({
  contract_no: z.string().max(50).optional(),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
  expected_amount: z.string().min(1, 'Required'),
  payment_frequency: z.enum(['monthly', 'quarterly', 'annual', 'one-time']),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  contract_id: z.string().min(1, 'Required'),
  amount: z.string().min(1, 'Required'),
  paid_date: z.string().min(1, 'Required'),
  payment_method: z.enum(['cash', 'cheque']),
  receipt_no: z.string().optional(),
  notes: z.string().optional(),
});

type ContactF = z.infer<typeof contactSchema>;
type ContractF = z.infer<typeof contractSchema>;
type PaymentF = z.infer<typeof paymentSchema>;

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function PartnerModal({ partner, open, onClose }: { partner: Partner; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';
  const mutations = usePartnerMutations();

  const { data: contacts = [] } = usePartnerContacts(partner.id, open);
  const { data: contracts = [] } = usePartnerContracts(partner.id, open);
  const { data: payments = [] } = usePartnerPaymentsByPartner(partner.id, open);
  const { data: documents = [] } = usePartnerDocuments(partner.id, open);

  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<PartnerContact | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PartnerContract | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner.company_name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-5">

            {/* Partner Info */}
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Sponsor Info</h4>
              <div className="space-y-1 text-sm">
                {partner.email && (
                  <a href={`mailto:${partner.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Mail size={13} /> {partner.email}
                  </a>
                )}
                {partner.phone && (
                  <a href={`tel:${partner.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Phone size={13} /> {partner.phone}
                  </a>
                )}
                {partner.notes && <p className="text-xs text-muted-foreground italic mt-1">{partner.notes}</p>}
                {(partner.address_street || partner.address_city || partner.address_country) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin size={13} /> {[partner.address_street, partner.address_city, partner.address_country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </section>

            {/* Contacts */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Contact Persons</h4>
                {canEdit && (
                  <button onClick={() => { setEditingContact(null); setContactOpen(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {contacts.length === 0
                ? <p className="text-xs text-muted-foreground">No contacts yet.</p>
                : contacts.map(ct => (
                  <div key={ct.id} className="border rounded p-2 text-xs mb-1.5 bg-background">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium">{ct.name}</span>
                        {ct.position && <span className="text-muted-foreground"> · {ct.position}</span>}
                        {ct.phone && <p className="text-muted-foreground mt-0.5"><Phone size={10} className="inline mr-0.5" />{ct.phone}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => { setEditingContact(ct); setContactOpen(true); }}
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => mutations.deleteContact.mutateAsync({ partnerId: partner.id, id: ct.id }).then(() => toast.success('Removed')).catch((err: unknown) => { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); })}
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </section>

            {/* Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Documents</h4>
                {canEdit && (
                  <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                    <Plus size={11} /> Upload
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx,.xlsx"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try { await mutations.uploadDocument(partner.id, file, 'other'); toast.success('Uploaded'); }
                        catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Upload failed'); }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {documents.length === 0
                ? <p className="text-xs text-muted-foreground">No documents yet.</p>
                : documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <FileText size={11} />
                      <a
                        href={`/api/partners/${partner.id}/documents/${doc.id}/download`}
                        target="_blank" rel="noreferrer"
                        className="text-primary hover:underline truncate max-w-[180px]"
                      >
                        {doc.file_name}
                      </a>
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => mutations.deleteDocument.mutateAsync({ partnerId: partner.id, id: doc.id }).then(() => toast.success('Deleted')).catch((err: unknown) => { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); })}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))
              }
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">

            {/* Contracts */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Contracts</h4>
                {canEdit && (
                  <button onClick={() => { setEditingContract(null); setContractOpen(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {contracts.length === 0
                ? <p className="text-xs text-muted-foreground">No contracts yet.</p>
                : contracts.map(c => (
                  <div key={c.id} className="border rounded p-2 text-xs mb-1.5 bg-background">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.contract_no && <span className="font-semibold text-foreground">#{c.contract_no}</span>}
                          <span className="font-medium capitalize">{c.payment_frequency}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[c.payment_status] ?? ''}`}>
                            {c.payment_status}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{formatDate(c.start_date)} → {formatDate(c.end_date)}</p>
                        <p>Expected: <span className="font-medium text-foreground"><AedAmount amount={c.expected_amount} /></span></p>
                        <p>Collected: <span className={`font-medium ${c.total_paid >= c.expected_amount ? 'text-green-600' : 'text-orange-500'}`}><AedAmount amount={c.total_paid} /></span></p>
                        {c.notes && <p className="italic text-muted-foreground">{c.notes}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-0.5 ml-2">
                          <button
                            onClick={() => { setEditingContract(c); setContractOpen(true); }}
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => mutations.deleteContract.mutateAsync({ partnerId: partner.id, id: c.id }).then(() => toast.success('Deleted')).catch((err: unknown) => { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); })}
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </section>

            {/* Payment History */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Payment History</h4>
                {canEdit && contracts.length > 0 && (
                  <button onClick={() => setPaymentOpen(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Record
                  </button>
                )}
              </div>
              {payments.length === 0
                ? <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1.5">Date</th>
                          <th className="text-right px-2 py-1.5">Amount</th>
                          <th className="text-left px-2 py-1.5">Method</th>
                          <th className="text-left px-2 py-1.5">Contract</th>
                          <th className="text-left px-2 py-1.5">Receipt</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payments.map(p => (
                          <tr key={p.id} className="hover:bg-muted/20">
                            <td className="px-2 py-1.5">{formatDate(p.paid_date)}</td>
                            <td className="px-2 py-1.5 text-right text-green-600 font-medium"><AedAmount amount={p.amount} /></td>
                            <td className="px-2 py-1.5 capitalize">{p.payment_method}</td>
                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                              {p.contract_no ? `#${p.contract_no}` : `${formatDate(p.contract_start)} – ${formatDate(p.contract_end)}`}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">{p.receipt_no ?? '—'}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                {p.attachments?.map(a => (
                                  <a key={a.id} href={`/api/partner-payments/${p.id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                                    className="text-primary hover:text-primary/80" title={a.file_name}>
                                    <Download size={11} />
                                  </a>
                                ))}
                                {canEdit && p.payment_method === 'cheque' && (
                                  <label className="cursor-pointer text-muted-foreground hover:text-foreground" title="Attach cheque copy">
                                    📎
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try { await mutations.uploadPaymentAttachment(p.id, partner.id, file); toast.success('Uploaded'); }
                                        catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Upload failed'); }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                                {canEdit && (
                                  <button
                                    onClick={() => {
                                      if (!confirm(`Delete this payment of AED ${p.amount.toLocaleString()}? Attached receipts will also be removed.`)) return;
                                      mutations.deletePayment.mutateAsync({ id: p.id, partnerId: partner.id }).then(() => toast.success('Deleted')).catch((err: unknown) => { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); });
                                    }}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </section>
          </div>
        </div>

        {/* Sub-dialogs */}
        <ContactFormDialog
          open={contactOpen}
          onClose={() => { setContactOpen(false); setEditingContact(null); }}
          partnerId={partner.id}
          editing={editingContact}
          onSave={editingContact
            ? d => mutations.updateContact.mutateAsync({ id: editingContact.id, ...d })
            : d => mutations.createContact.mutateAsync({ ...d, partner_id: d.partnerId })
          }
        />
        <ContractFormDialog
          open={contractOpen}
          onClose={() => { setContractOpen(false); setEditingContract(null); }}
          partnerId={partner.id}
          editing={editingContract}
          onSave={editingContract
            ? d => mutations.updateContract.mutateAsync({ id: editingContract.id, ...d })
            : d => mutations.createContract.mutateAsync({ ...d, partner_id: d.partnerId, status: 'active' })
          }
        />
        <PaymentFormDialog open={paymentOpen} onClose={() => setPaymentOpen(false)} partnerId={partner.id} contracts={contracts} onSave={mutations.createPayment.mutateAsync} />
      </DialogContent>
    </Dialog>
  );
}

function ContactFormDialog({ open, onClose, partnerId, editing, onSave }: {
  open: boolean; onClose: () => void; partnerId: number;
  editing?: PartnerContact | null;
  onSave: (d: { partnerId: number; name: string; position?: string; phone?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ContactF>({ resolver: zodResolver(contactSchema) });

  useEffect(() => {
    if (open) {
      reset(editing
        ? { name: editing.name, position: editing.position ?? '', phone: editing.phone ?? '' }
        : { name: '', position: '', phone: '' }
      );
    }
  }, [open, editing, reset]);

  async function onSubmit(v: ContactF) {
    try { await onSave({ partnerId, ...v }); toast.success(editing ? 'Updated' : 'Contact added'); reset(); onClose(); }
    catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Contact' : 'Add Contact Person'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
          <div><Label>Position</Label><Input {...register('position')} className="mt-1" /></div>
          <div><Label>Phone</Label><Input {...register('phone')} className="mt-1" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContractFormDialog({ open, onClose, partnerId, editing, onSave }: {
  open: boolean; onClose: () => void; partnerId: number;
  editing?: PartnerContract | null;
  onSave: (d: { partnerId: number; contract_no?: string; start_date: string; end_date: string; expected_amount: number; payment_frequency: 'monthly' | 'quarterly' | 'annual' | 'one-time'; notes?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting } } = useForm<ContractF>({
    resolver: zodResolver(contractSchema),
    defaultValues: { payment_frequency: 'annual' },
  });

  useEffect(() => {
    if (open) {
      reset(editing
        ? {
            contract_no: editing.contract_no ?? '',
            start_date: editing.start_date,
            end_date: editing.end_date,
            expected_amount: String(editing.expected_amount),
            payment_frequency: editing.payment_frequency,
            notes: editing.notes ?? '',
          }
        : { contract_no: '', payment_frequency: 'annual', start_date: '', end_date: '', expected_amount: '', notes: '' }
      );
    }
  }, [open, editing, reset]);

  async function onSubmit(v: ContractF) {
    try {
      await onSave({ partnerId, ...v, expected_amount: Number(v.expected_amount) });
      toast.success(editing ? 'Updated' : 'Contract added'); reset(); onClose();
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Contract' : 'Add Contract'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><Label>Contract No.</Label><Input {...register('contract_no')} placeholder="e.g. 2025-001" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date *</Label><Controller control={control} name="start_date" render={({ field }) => <DateInput {...field} className="mt-1" />} /></div>
            <div><Label>End Date *</Label><Controller control={control} name="end_date" render={({ field }) => <DateInput {...field} className="mt-1" />} /></div>
          </div>
          <div><Label>Expected Amount (AED) *</Label><Input {...register('expected_amount')} type="number" min={0} className="mt-1" /></div>
          <div>
            <Label>Payment Frequency *</Label>
            <Select value={watch('payment_frequency')} onValueChange={v => setValue('payment_frequency', v as ContractF['payment_frequency'])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="one-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentFormDialog({ open, onClose, partnerId, contracts, onSave }: {
  open: boolean; onClose: () => void; partnerId: number; contracts: PartnerContract[];
  onSave: (d: { partnerId: number; partner_id: number; contract_id: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) => Promise<unknown>;
}) {
  const { register, handleSubmit, reset, watch, setValue, control: payControl, formState: { isSubmitting } } = useForm<PaymentF>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { payment_method: 'cheque', paid_date: new Date().toISOString().slice(0, 10) },
  });
  async function onSubmit(v: PaymentF) {
    try {
      await onSave({
        partnerId,
        partner_id: partnerId,
        contract_id: Number(v.contract_id),
        amount: Number(v.amount),
        paid_date: v.paid_date,
        payment_method: v.payment_method,
        receipt_no: v.receipt_no || undefined,
        notes: v.notes || undefined,
      });
      toast.success('Payment recorded'); reset(); onClose();
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); }
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Contract *</Label>
            <Select value={watch('contract_id') ?? ''} onValueChange={v => setValue('contract_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.contract_no ? `#${c.contract_no} · ` : ''}{formatDate(c.start_date)} → {formatDate(c.end_date)} · <AedAmount amount={c.expected_amount} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Amount (AED) *</Label><Input {...register('amount')} type="number" min={0} step="0.01" className="mt-1" /></div>
          <div><Label>Date *</Label><Controller control={payControl} name="paid_date" render={({ field }) => <DateInput {...field} className="mt-1" />} /></div>
          <div>
            <Label>Method *</Label>
            <div className="flex gap-1 mt-1">
              {(['cash', 'cheque'] as const).map(m => (
                <button key={m} type="button" onClick={() => setValue('payment_method', m)}
                  className={`flex-1 text-xs py-1.5 rounded border capitalize transition-colors ${watch('payment_method') === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Receipt No.</Label><Input {...register('receipt_no')} className="mt-1" /></div>
          <div><Label>Notes</Label><Input {...register('notes')} className="mt-1" placeholder="Optional" /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
