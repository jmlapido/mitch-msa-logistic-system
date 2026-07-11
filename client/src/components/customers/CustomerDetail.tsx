import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenants } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { AedAmount } from '@/components/ui/AedAmount';
import { ContractsPanel } from '@/components/rentals/ContractsPanel';
import { DocumentsPanel } from '@/components/rentals/DocumentsPanel';
import { avatarColor } from './directoryUtils';
import { LeaseStatusBadge, TypeIcon, LastEditedBy } from './badges';
import { CustomerFormDialog } from './CustomerFormDialog';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

export function CustomerDetail({ id }: { id: number }) {
  const { data: tenants = [], isLoading } = useTenants();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const t = tenants.find(x => x.id === id);

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!t) {
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-2">Customer not found or archived.</p>
        <Link to="/customers" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to customers
        </Link>
      </div>
    );
  }

  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <div className="space-y-4">
      <Link to="/customers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft size={14} /> All customers
      </Link>

      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ backgroundColor: avatarColor(t.name) }}
        >
          {t.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold capitalize">
            {t.name}
            <TypeIcon type={t.tenant_type} />
          </h2>
          <LastEditedBy entityType="tenant" entityId={t.id} />
        </div>
        <LeaseStatusBadge tenant={t} />
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1" /> Edit
          </Button>
        )}
      </div>

      {(t.total_balance ?? 0) > 0 && (
        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg px-4 py-2.5 text-sm font-medium">
          <AedAmount amount={t.total_balance!} /> total rental balance due
        </div>
      )}

      <div className="bg-card border rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Profile</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Phone" value={t.phone} />
          <Field label="Alt. Phone" value={t.phone_alt} />
          <Field label="Email" value={t.email} />
          <Field label="Address" value={t.address} />
          {t.tenant_type === 'company' ? (
            <>
              <Field label="Trade License" value={t.trade_license_no} />
              <Field label="TRN" value={t.trn} />
              <Field label="Contact Person" value={t.contact_person_name} />
              <Field label="Contact Phone" value={t.contact_person_phone} />
              <Field label="Contact Email" value={t.contact_person_email} />
            </>
          ) : (
            <>
              <Field label="Emirates ID" value={t.id_number} />
              <Field label="Nationality" value={t.nationality} />
            </>
          )}
          <Field label="Notes" value={t.notes} />
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4">
        <ContractsPanel tenantId={t.id} />
      </div>

      <div className="bg-card border rounded-lg p-4">
        <p className="text-xs font-medium mb-2">Documents</p>
        <DocumentsPanel entityType="tenant" entityId={t.id} />
      </div>

      <CustomerFormDialog open={editOpen} editing={t} onClose={() => setEditOpen(false)} />
    </div>
  );
}
