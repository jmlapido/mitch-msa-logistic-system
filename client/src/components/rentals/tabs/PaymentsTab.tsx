import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRentPayments, useBuildings, useRentalMutations, type RentPayment } from '@/lib/hooks/useRentals';
import { currentMonth, monthLabel, formatAED, formatDate } from '@/lib/utils';

export function PaymentsTab() {
  const [month, setMonth] = useState(currentMonth());
  const [buildingFilter, setBuildingFilter] = useState<number | undefined>();
  const { data: payments = [], isLoading } = useRentPayments(month, buildingFilter);
  const { data: buildings = [] } = useBuildings();
  const { updateRentPayment } = useRentalMutations();

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
  const totalCollected = payments.filter(p => p.status === 'collected').reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="hover:text-primary"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="hover:text-primary"><ChevronRight size={16} /></button>
        </div>
        <select value={buildingFilter ?? ''} onChange={e => setBuildingFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs px-2 py-1 rounded border bg-background border-border">
          <option value="">All buildings</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="ml-auto flex gap-4 text-sm">
          <span>Expected: <strong>{formatAED(totalExpected)}</strong></span>
          <span className="text-green-600">Collected: <strong>{formatAED(totalCollected)}</strong></span>
          <span className="text-red-600">Pending: <strong>{formatAED(totalExpected - totalCollected)}</strong></span>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          {Object.values(grouped).map(group => {
            const groupExpected = group.items.reduce((s, p) => s + p.expected_rent, 0);
            const groupCollected = group.items.filter(p => p.status === 'collected').reduce((s, p) => s + p.amount, 0);
            return (
              <div key={group.name} className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 flex justify-between items-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>{group.name}</span>
                  <span>{formatAED(groupCollected)} / {formatAED(groupExpected)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5">Unit</th>
                      <th className="text-left px-3 py-1.5">Tenant</th>
                      <th className="text-right px-3 py-1.5">Expected</th>
                      <th className="text-right px-3 py-1.5">Collected</th>
                      <th className="text-center px-3 py-1.5">Date</th>
                      <th className="text-center px-3 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map(p => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{p.unit_no}</td>
                        <td className="px-3 py-2 text-xs">{p.tenant_name}</td>
                        <td className="px-3 py-2 text-right text-xs">{formatAED(p.expected_rent)}</td>
                        <td className="px-3 py-2 text-right">{p.status === 'collected' ? formatAED(p.amount) : '—'}</td>
                        <td className="px-3 py-2 text-center text-xs">{formatDate(p.paid_date)}</td>
                        <td className="px-3 py-2 text-center">
                          <CollectPopover payment={p} onUpdate={updateRentPayment.mutateAsync} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CollectPopover({ payment, onUpdate }: { payment: RentPayment; onUpdate: (d: { id: number; status: string; paid_date?: string; receipt_no?: string; amount?: number }) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState(payment.receipt_no ?? '');

  const STATUS_STYLE: Record<string, string> = {
    collected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  async function collect() {
    try {
      await onUpdate({ id: payment.id, status: 'collected', amount: Number(amount), paid_date: date, receipt_no: receipt || undefined });
      toast.success('Rent collected');
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[payment.status] ?? ''}`}>
          {payment.status}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2">
        <p className="text-xs font-semibold">Unit {payment.unit_no}</p>
        <div><Label className="text-xs">Amount</Label><Input value={amount} onChange={e => setAmount(e.target.value)} type="number" className="mt-0.5 h-7 text-xs" /></div>
        <div><Label className="text-xs">Date</Label><Input value={date} onChange={e => setDate(e.target.value)} type="date" className="mt-0.5 h-7 text-xs" /></div>
        <div><Label className="text-xs">Receipt No.</Label><Input value={receipt} onChange={e => setReceipt(e.target.value)} className="mt-0.5 h-7 text-xs" /></div>
        <Button size="sm" className="w-full" onClick={collect}><Check size={12} className="mr-1" /> Mark Collected</Button>
      </PopoverContent>
    </Popover>
  );
}
