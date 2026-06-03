import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Check, Phone, Mail, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { useRentPayments, useBuildings, useRentalMutations, usePaymentEntries, type RentPayment, type PaymentEntry } from '@/lib/hooks/useRentals';
import { ContractsPanel } from '../ContractsPanel';
import { currentMonth, monthLabel, formatDate } from '@/lib/utils';
import { AedAmount } from '@/components/ui/AedAmount';

function dueDateColor(dateStr: string, status: string): string {
  if (status === 'collected') return 'text-muted-foreground';
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'font-semibold text-red-600 dark:text-red-400';
  if (diff <= 7) return 'font-semibold text-amber-600 dark:text-amber-400';
  return 'text-foreground';
}

export function PaymentsTab() {
  const [month, setMonth] = useState(currentMonth());
  const [buildingFilter, setBuildingFilter] = useState<number | undefined>();
  const [tenantDetail, setTenantDetail] = useState<RentPayment | null>(null);
  const { data: payments = [], isLoading } = useRentPayments(month, buildingFilter);
  const { data: buildings = [] } = useBuildings();
  const { addPaymentEntry, deletePaymentEntry } = useRentalMutations();

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const grouped = payments.reduce<Record<string, { name: string; items: RentPayment[] }>>((acc, p) => {
    const key = String(p.building_id);
    if (!acc[key]) acc[key] = { name: p.building_name, items: [] };
    acc[key]!.items.push(p);
    return acc;
  }, {});

  const totalExpected = payments.reduce((s, p) => s + p.expected_rent, 0);
  const totalCollected = payments.reduce((s, p) => s + p.amount_paid, 0);
  const totalPending = totalExpected - totalCollected;
  const totalOverdue = payments.reduce((s, p) => s + (p.tenant_overdue ?? 0), 0);
  const totalCash = payments.reduce((s, p) => s + (p.cash_collected ?? 0), 0);
  const totalCheque = payments.reduce((s, p) => s + (p.cheque_collected ?? 0), 0);

  const sidebar = useMemo(() => {
    const statusOrder = ['overdue', 'partial', 'pending', 'collected'] as const;
    const byStatus: Record<string, { count: number; amount: number }> = {};

    for (const p of payments) {
      if (!byStatus[p.status]) byStatus[p.status] = { count: 0, amount: 0 };
      byStatus[p.status]!.count += 1;
      if (p.status === 'collected') byStatus[p.status]!.amount += p.amount_paid;
      else if (p.status === 'overdue') byStatus[p.status]!.amount += p.tenant_overdue ?? 0;
      else byStatus[p.status]!.amount += p.expected_rent - p.amount_paid;
    }

    const byBuilding = Object.values(grouped).map(g => ({
      name: g.name,
      expected: g.items.reduce((s, p) => s + p.expected_rent, 0),
      collected: g.items.reduce((s, p) => s + p.amount_paid, 0),
    })).sort((a, b) => b.expected - a.expected);

    return {
      statusRows: statusOrder.filter(s => byStatus[s]).map(s => ({ status: s, ...byStatus[s]! })),
      byBuilding,
    };
  }, [payments, grouped]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronLeft size={20} /></button>
          <span className="text-base font-semibold w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><ChevronRight size={20} /></button>
        </div>
        <select value={buildingFilter ?? ''} onChange={e => setBuildingFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs px-2 py-1 rounded border bg-background border-border">
          <option value="">All buildings</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Expected" value={<AedAmount amount={totalExpected} />} />
        <StatCard label="Collected" value={<AedAmount amount={totalCollected} />} valueClass="text-green-600" />
        <StatCard label="Pending" value={<AedAmount amount={totalPending} />} valueClass={totalPending > 0 ? 'text-yellow-600' : undefined} />
        <StatCard label="Total Overdue" value={<AedAmount amount={totalOverdue} />} valueClass={totalOverdue > 0 ? 'text-red-600' : undefined} />
        <StatCard label="Cash Collected" value={<AedAmount amount={totalCash} />} valueClass={totalCash > 0 ? 'text-green-600' : undefined} />
        <StatCard label="Cheque Collected" value={<AedAmount amount={totalCheque} />} valueClass={totalCheque > 0 ? 'text-green-600' : undefined} />
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="flex flex-col-reverse gap-6 md:flex-row">
          {/* Main table */}
          <div className="flex-1 min-w-0 space-y-4">
            {Object.entries(grouped).map(([bid, group]) => {
              const groupExpected = group.items.reduce((s, p) => s + p.expected_rent, 0);
              const groupCollected = group.items.reduce((s, p) => s + p.amount_paid, 0);
              return (
                <div key={bid} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-3 py-2 flex justify-between items-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>{group.name}</span>
                    <span><span className="text-green-600"><AedAmount amount={groupCollected} /></span> / <AedAmount amount={groupExpected} /></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-1.5">Unit</th>
                          <th className="text-left px-3 py-1.5">Tenant</th>
                          <th className="text-right px-3 py-1.5">Rent</th>
                          <th className="hidden sm:table-cell text-right px-3 py-1.5">Collected</th>
                          <th className="hidden sm:table-cell text-right px-3 py-1.5 text-red-500">Overdue</th>
                          <th className="hidden sm:table-cell text-right px-3 py-1.5">Balance</th>
                          <th className="hidden sm:table-cell text-center px-3 py-1.5">Paid Date</th>
                          <th className="hidden sm:table-cell text-center px-3 py-1.5">Due Date</th>
                          <th className="text-center px-3 py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.items.map(p => {
                          const shouldHighlight = p.status === 'overdue' || p.status === 'partial' || (p.balance ?? 0) > 0;
                          return (
                            <tr key={p.id} className={`hover:bg-muted/20 ${shouldHighlight ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                              <td className="px-3 py-2 font-medium">{p.unit_no}</td>
                              <td className="px-3 py-2 text-xs">
                                <button
                                  onClick={() => setTenantDetail(p)}
                                  className="text-primary hover:underline text-left"
                                >
                                  <span className="capitalize">{p.tenant_name}</span>
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right text-xs"><AedAmount amount={p.expected_rent} /></td>
                              <td className="hidden sm:table-cell px-3 py-2 text-right">
                                {p.status === 'collected' && <span className="text-green-600"><AedAmount amount={p.amount_paid} /></span>}
                                {p.status === 'partial' && (
                                  <span className="text-orange-600 text-xs"><AedAmount amount={p.amount_paid} /> <span className="text-muted-foreground">/ <AedAmount amount={p.expected_rent} /></span></span>
                                )}
                                {p.status !== 'collected' && p.status !== 'partial' && <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="hidden sm:table-cell px-3 py-2 text-right text-xs">
                                {(p.tenant_overdue ?? 0) > 0 ? <span className="text-red-600 font-medium"><AedAmount amount={p.tenant_overdue} /></span> : '—'}
                              </td>
                              <td className="hidden sm:table-cell px-3 py-2 text-right text-xs">
                                {(p.balance ?? 0) > 0 ? <span className="text-red-600 font-semibold"><AedAmount amount={p.balance} /></span> : <span className="text-green-600">—</span>}
                              </td>
                              <td className="hidden sm:table-cell px-3 py-2 text-center text-xs">{formatDate(p.paid_date)}</td>
                              <td className="hidden sm:table-cell px-3 py-2 text-center text-xs">
                                {p.due_date ? (
                                  <span className={dueDateColor(p.due_date, p.status)}>{formatDate(p.due_date)}</span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <PaymentPopover payment={p} onAdd={addPaymentEntry.mutateAsync} onDelete={deletePaymentEntry.mutateAsync} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar */}
          <div className="md:w-52 md:shrink-0 md:border-l md:pl-4 space-y-5">
            {/* By Status */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Status</h3>
              <div className="space-y-2">
                {sidebar.statusRows.map(({ status, count, amount }) => {
                  const amountColor =
                    status === 'collected' ? 'text-green-600' :
                    status === 'overdue'   ? 'text-red-600'   :
                    status === 'partial'   ? 'text-orange-600' :
                    'text-yellow-600';
                  const amountLabel =
                    status === 'collected' ? 'Collected' :
                    status === 'overdue'   ? 'Overdue'   :
                    'Remaining';
                  const badgeStyle: Record<string, string> = {
                    collected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                    partial:   'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
                    pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                    overdue:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                  };
                  return (
                    <div key={status} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${badgeStyle[status] ?? ''}`}>{status}</span>
                        <span className="text-muted-foreground">{count} unit{count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{amountLabel}</span>
                        <span className={`font-medium ${amountColor}`}><AedAmount amount={amount} /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Building */}
            {sidebar.byBuilding.length > 1 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Building</h3>
                <div className="space-y-1.5">
                  {sidebar.byBuilding.map(b => (
                    <div key={b.name} className="text-xs">
                      <p className="font-medium truncate max-w-[180px]">{b.name}</p>
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-green-600"><AedAmount amount={b.collected} /></span>
                        <span><AedAmount amount={b.expected} /></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!tenantDetail} onOpenChange={v => !v && setTenantDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">{tenantDetail?.tenant_name}</DialogTitle>
          </DialogHeader>
          {tenantDetail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 size={12} /> {tenantDetail.unit_no} — {tenantDetail.building_name}
                </span>
                {tenantDetail.tenant_phone && (
                  <a href={`tel:${tenantDetail.tenant_phone}`} className="flex items-center gap-1 hover:text-foreground">
                    <Phone size={12} /> {tenantDetail.tenant_phone}
                  </a>
                )}
                {tenantDetail.tenant_email && (
                  <a href={`mailto:${tenantDetail.tenant_email}`} className="flex items-center gap-1 hover:text-foreground">
                    <Mail size={12} /> {tenantDetail.tenant_email}
                  </a>
                )}
              </div>
              <div className="border-t pt-3">
                <ContractsPanel tenantId={tenantDetail.tenant_id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="border rounded-lg px-4 py-3 bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}

function PaymentPopover({
  payment,
  onAdd,
  onDelete,
}: {
  payment: RentPayment;
  onAdd: (d: { rentPaymentId: number; amount: number; paid_date: string; payment_method: 'cash' | 'cheque'; receipt_no?: string; notes?: string }) => Promise<unknown>;
  onDelete: (d: { rentPaymentId: number; entryId: number }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const { data: entries = [], isLoading: loadingEntries } = usePaymentEntries(payment.id, open);
  const defaultMethod: 'cash' | 'cheque' = payment.payment_type === 'cash' ? 'cash' : 'cheque';

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque'>(defaultMethod);
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const remaining = Math.max(0, payment.expected_rent - payment.amount_paid);
      setAmount(remaining > 0 ? String(remaining) : '');
      setDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod(defaultMethod);
      setReceipt('');
      setNotes('');
    }
  }, [open, payment.expected_rent, payment.amount_paid, payment.payment_type]);

  const STATUS_STYLE: Record<string, string> = {
    collected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    partial:   'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    overdue:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  async function handleAdd() {
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      await onAdd({
        rentPaymentId: payment.id,
        amount: Number(amount),
        paid_date: date,
        payment_method: paymentMethod,
        receipt_no: receipt || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded');
      setOpen(false);
    } catch { toast.error('Failed'); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(entry: PaymentEntry) {
    try {
      await onDelete({ rentPaymentId: payment.id, entryId: entry.id });
      toast.success('Entry removed');
    } catch { toast.error('Failed'); }
  }

  const totalPaid = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <button
        className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[payment.status] ?? ''}`}
        onClick={() => setOpen(true)}
      >
        {payment.status}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unit {payment.unit_no} — {monthLabel(payment.month)}</DialogTitle>
            <p className="text-xs text-muted-foreground capitalize">{payment.tenant_name} · {payment.building_name}</p>
          </DialogHeader>

          <div className="space-y-3">
            {loadingEntries && <p className="text-xs text-muted-foreground">Loading…</p>}

            {entries.length > 0 && (
              <div className="space-y-0.5">
                {entries.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                    <div className="flex flex-col">
                      <span className="text-foreground">{formatDate(e.paid_date)} · <span className="capitalize">{e.payment_method ?? '—'}</span></span>
                      {e.receipt_no && <span className="text-muted-foreground">#{e.receipt_no}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium"><AedAmount amount={e.amount} /></span>
                      <button onClick={() => handleDelete(e)} className="text-red-400 hover:text-red-600 leading-none">✕</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-semibold pt-1">
                  <span>Total paid</span>
                  <span className={totalPaid >= payment.expected_rent ? 'text-green-600' : 'text-orange-600'}>
                    <AedAmount amount={totalPaid} /> / <AedAmount amount={payment.expected_rent} />
                  </span>
                </div>
              </div>
            )}

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Add Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Amount</Label><Input value={amount} onChange={e => setAmount(e.target.value)} onFocus={e => e.target.select()} type="number" className="mt-1 h-8 text-xs" /></div>
                <div><Label className="text-xs">Date</Label><DateInput value={date} onChange={setDate} className="mt-1 h-8 text-xs" /></div>
              </div>
              <div>
                <Label className="text-xs">Method</Label>
                <div className="flex gap-2 mt-1">
                  {(['cash', 'cheque'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                      className={`flex-1 text-xs py-1.5 rounded border capitalize transition-colors ${
                        paymentMethod === m
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Receipt No.</Label><Input value={receipt} onChange={e => setReceipt(e.target.value)} className="mt-1 h-8 text-xs" /></div>
                <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 h-8 text-xs" placeholder="Optional" /></div>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={submitting}>
                <Check size={14} className="mr-1.5" /> Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
