import { useState, useMemo } from 'react';
import { usePartners, usePartnerPaymentsTab } from '@/lib/hooks/usePartners';
import { formatAED, formatDate } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  paid:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function PaymentsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partnerId, setPartnerId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState('all');
  const [applied, setApplied] = useState<{ from: string; to: string; partnerId?: number; status: string }>({
    from: '', to: '', status: 'all',
  });

  const { data: partners = [] } = usePartners();
  const { data, isLoading } = usePartnerPaymentsTab({
    from: applied.from || undefined,
    to: applied.to || undefined,
    partnerId: applied.partnerId,
    status: applied.status !== 'all' ? applied.status : undefined,
  });

  const rows = data?.rows ?? [];
  const stats = data?.stats ?? { totalPartners: 0, totalExpected: 0, totalCollected: 0, overdue: 0, partial: 0 };

  const sidebar = useMemo(() => {
    const statusOrder = ['overdue', 'partial', 'pending', 'paid'] as const;
    const byStatus: Record<string, { count: number; amount: number }> = {};
    const bySponsors: Record<number, { name: string; expected: number; collected: number }> = {};

    for (const r of rows) {
      if (!byStatus[r.status]) byStatus[r.status] = { count: 0, amount: 0 };
      byStatus[r.status]!.count += 1;
      byStatus[r.status]!.amount += r.status === 'paid' ? r.total_paid : r.expected_amount - r.total_paid;

      if (!bySponsors[r.partner_id]) bySponsors[r.partner_id] = { name: r.partner_name, expected: 0, collected: 0 };
      bySponsors[r.partner_id]!.expected += r.expected_amount;
      bySponsors[r.partner_id]!.collected += r.total_paid;
    }

    return {
      statusRows: statusOrder.filter(s => byStatus[s]).map(s => ({ status: s, ...byStatus[s]! })),
      sponsorRows: Object.values(bySponsors).sort((a, b) => b.expected - a.expected),
    };
  }, [rows]);

  function apply() {
    setApplied({ from, to, partnerId, status: filterStatus });
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Sponsors" value={String(stats.totalPartners)} />
        <StatCard label="Total Collected" value={formatAED(stats.totalCollected)} valueClass="text-green-600" />
        <StatCard label="Partial Remaining" value={formatAED(stats.partial)} valueClass={stats.partial > 0 ? 'text-yellow-600' : undefined} />
        <StatCard label="Overdue" value={formatAED(stats.overdue)} valueClass={stats.overdue > 0 ? 'text-red-600' : undefined} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Sponsor</p>
          <select
            value={partnerId ?? ''}
            onChange={e => setPartnerId(e.target.value ? Number(e.target.value) : undefined)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="">All Sponsors</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.company_name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <input type="month" value={from} onChange={e => setFrom(e.target.value)}
            className="block border rounded px-2 py-1 text-xs bg-background border-border" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <input type="month" value={to} onChange={e => setTo(e.target.value)}
            className="block border rounded px-2 py-1 text-xs bg-background border-border" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs px-2 py-1 rounded border bg-background border-border"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <button
          type="button"
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded border bg-background border-border hover:bg-muted"
        >
          Apply
        </button>
      </div>

      {/* Table + Sidebar */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contracts found.</p>
      ) : (
        <div className="flex flex-col-reverse gap-6 md:flex-row">
          {/* Table */}
          <div className="flex-1 min-w-0">
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2">Sponsor</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Contract #</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Start</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Frequency</th>
                      <th className="text-right px-3 py-2">Expected</th>
                      <th className="text-right px-3 py-2">Collected</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Balance</th>
                      <th className="text-center px-3 py-2 hidden sm:table-cell">Contract End</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(r => {
                      const balance = r.expected_amount - r.total_paid;
                      return (
                        <tr key={r.contract_id} className={`hover:bg-muted/20 ${r.status === 'overdue' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                          <td className="px-3 py-2 font-medium text-sm">{r.partner_name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.contract_no ? `#${r.contract_no}` : '—'}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{formatDate(r.start_date)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell capitalize">{r.payment_frequency}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatAED(r.expected_amount)}</td>
                          <td className="px-3 py-2 text-right text-xs">
                            {r.total_paid > 0
                              ? <span className="text-green-600">{formatAED(r.total_paid)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">
                            {balance > 0
                              ? <span className="text-red-600 font-medium">{formatAED(balance)}</span>
                              : <span className="text-green-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center text-xs hidden sm:table-cell">{formatDate(r.end_date)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[r.status] ?? ''}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="md:w-52 md:shrink-0 md:border-l md:pl-4 space-y-5">
            {/* By Status */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Status</h3>
              <div className="space-y-2">
                {sidebar.statusRows.map(({ status, count, amount }) => (
                  <div key={status} className="text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[status] ?? ''}`}>{status}</span>
                      <span className="text-muted-foreground">{count} contract{count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{status === 'paid' ? 'Collected' : status === 'overdue' ? 'Overdue' : 'Remaining'}</span>
                      <span className={status === 'paid' ? 'text-green-600 font-medium' : status === 'overdue' ? 'text-red-600 font-medium' : 'text-yellow-600 font-medium'}>
                        {formatAED(amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Sponsor */}
            {sidebar.sponsorRows.length > 1 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Sponsor</h3>
                <div className="space-y-1.5">
                  {sidebar.sponsorRows.map(s => (
                    <div key={s.name} className="text-xs">
                      <p className="font-medium truncate max-w-[180px]">{s.name}</p>
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-green-600">{formatAED(s.collected)}</span>
                        <span>{formatAED(s.expected)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border rounded-lg px-4 py-3 bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}
