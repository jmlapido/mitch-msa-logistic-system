import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePaymentHistory, type PaymentHistoryMonth } from '@/lib/hooks/useRentals';
import { AedAmount } from '@/components/ui/AedAmount';
import { formatDate } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  collected:   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial:     'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue:     'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  written_off: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function defaultMonthExpanded(status: string, balance: number): boolean {
  return status === 'overdue' || status === 'partial' || balance > 0;
}

function MonthRow({ month }: { month: PaymentHistoryMonth }) {
  const [open, setOpen] = useState(defaultMonthExpanded(month.status, month.balance));

  return (
    <div className="rounded border bg-muted/30">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs gap-2"
      >
        <span className="flex items-center gap-1.5 font-medium shrink-0">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {month.month_label}
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground truncate">
            Due <AedAmount amount={month.expected_rent} /> · Paid <AedAmount amount={month.amount_paid} />
          </span>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[month.status] ?? ''}`}>
            {month.status === 'written_off' ? 'Written Off' : month.status}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1 border-t pt-1.5">
          {month.entries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No payments recorded</p>
          ) : (
            month.entries.map(e => (
              <div key={e.id} className="flex items-center justify-between text-[11px] py-1 border-b last:border-0">
                <div className="flex flex-col">
                  <span>{formatDate(e.paid_date)} · <span className="capitalize">{e.payment_method ?? '—'}</span></span>
                  {e.receipt_no && <span className="text-muted-foreground">#{e.receipt_no}</span>}
                </div>
                <span className="font-medium"><AedAmount amount={e.amount} /></span>
              </div>
            ))
          )}
          {month.status === 'written_off' && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
              <AedAmount amount={month.written_off_amount ?? 0} /> written off
              {month.written_off_reason ? ` — ${month.written_off_reason}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentHistoryPanel({ contractId }: { contractId: number }) {
  const [open, setOpen] = useState(false);
  const { data: months = [], isLoading } = usePaymentHistory(contractId);

  const dueCount = useMemo(
    () => months.filter(m => m.status === 'overdue' || m.status === 'partial').length,
    [months]
  );
  const summary = months.length === 0
    ? 'No history'
    : `${months.length} month${months.length === 1 ? '' : 's'}${dueCount > 0 ? ` · ${dueCount} due` : ''}`;

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1 font-medium">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Payment History
        </span>
        <span className="text-[10px]">{isLoading ? 'Loading…' : summary}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {months.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payment history yet</p>
          ) : (
            months.map(m => <MonthRow key={m.rent_payment_id} month={m} />)
          )}
        </div>
      )}
    </div>
  );
}
