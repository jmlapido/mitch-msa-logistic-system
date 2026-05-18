import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useArchivedTenants, useRentalMutations, useContracts, type ArchivedTenant } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatDate, formatAED } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function ArchivedTenantRow({ tenant }: { tenant: ArchivedTenant }) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();
  const { restoreTenant } = useRentalMutations();
  const { data: contracts = [] } = useContracts(expanded ? tenant.id : 0);

  async function handleRestore() {
    if (!confirm(`Restore ${tenant.name}? You will need to reassign their unit manually.`)) return;
    try {
      await restoreTenant.mutateAsync(tenant.id);
      toast.success(`${tenant.name} restored`);
    } catch { toast.error('Failed to restore'); }
  }

  return (
    <div className="border rounded-lg overflow-hidden mb-2">
      <div
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
          {tenant.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{tenant.name}</div>
          <div className="text-xs text-muted-foreground">
            Archived {formatDate(tenant.archived_at)}
            {tenant.last_contract_end && ` · Contract ended ${formatDate(tenant.last_contract_end)}`}
          </div>
        </div>
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <Button
            size="sm" variant="outline"
            onClick={e => { e.stopPropagation(); handleRestore(); }}
            className="shrink-0 gap-1"
          >
            <RotateCcw size={12} /> Restore
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-4 py-3 border-t bg-muted/20 space-y-3">
          <div>
            <p className="text-xs font-medium mb-1">Contact</p>
            <p className="text-xs text-muted-foreground">Phone: {tenant.phone ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Email: {tenant.email ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Emirates ID: {tenant.id_number ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Contracts (permanent)</p>
            {contracts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contracts</p>
            ) : (
              <div className="space-y-1">
                {contracts.map(c => (
                  <div key={c.id} className="text-xs border rounded p-2">
                    <span className="font-semibold">#{c.contract_no}</span>
                    <span className="text-muted-foreground ml-2">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                    <span className="text-muted-foreground ml-2">{formatAED(c.annual_rent)}/yr</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">
            Financial records (payments, PDC, documents) are retained for 1 year from archive date, then auto-purged.
          </p>
        </div>
      )}
    </div>
  );
}

export function ArchivedTab() {
  const { data: archived = [], isLoading } = useArchivedTenants();

  return (
    <div>
      <h2 className="font-semibold mb-4">Archived Tenants</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : archived.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived tenants</p>
      ) : (
        archived.map(t => <ArchivedTenantRow key={t.id} tenant={t} />)
      )}
    </div>
  );
}
