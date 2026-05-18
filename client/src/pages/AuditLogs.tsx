import { useState } from 'react';
import { useAuditLogs, useAuditLogUsers, useAuditLogActions } from '@/lib/hooks/useAuditLogs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function AuditLogs() {
  const [userId, setUserId] = useState<number | undefined>();
  const [action, setAction] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useAuditLogs({ user_id: userId, action, entity_type: entityType, date_from: dateFrom || undefined, date_to: dateTo || undefined, page });
  const { data: users = [] } = useAuditLogUsers();
  const { data: actions = [] } = useAuditLogActions();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function reset() {
    setUserId(undefined); setAction(undefined); setEntityType(undefined);
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={userId ? String(userId) : 'all'} onValueChange={v => { setUserId(v === 'all' ? undefined : Number(v)); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map(u => <SelectItem key={u.user_id} value={String(u.user_id)}>{u.user_name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={action ?? 'all'} onValueChange={v => { setAction(v === 'all' ? undefined : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map(a => <SelectItem key={a.action} value={a.action}>{a.action}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={entityType ?? 'all'} onValueChange={v => { setEntityType(v === 'all' ? undefined : v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {['tenant', 'contract', 'payment', 'bill', 'pdc', 'user'].map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-40" placeholder="From" />
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-40" placeholder="To" />

        <Button variant="outline" size="sm" onClick={reset}>Clear</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load audit logs.</p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date / Time</th>
                  <th className="text-left px-4 py-2 font-medium">User</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.results ?? []).map(log => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-medium">{log.user_name}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{log.entity_type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{log.note ?? '—'}</td>
                  </tr>
                ))}
                {(data?.results ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">{data?.total ?? 0} entries</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm self-center">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
