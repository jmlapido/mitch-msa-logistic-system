import { User, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import type { Tenant } from '@/lib/hooks/useRentals';

export function TypeIcon({ type }: { type: Tenant['tenant_type'] }) {
  return type === 'company'
    ? <Building2 size={12} className="inline ml-1 text-muted-foreground" aria-label="Company" />
    : <User size={12} className="inline ml-1 text-muted-foreground" aria-label="Person" />;
}

export function LeaseStatusBadge({ tenant }: { tenant: Tenant }) {
  if (!tenant.lease_id) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">No Lease</span>;
  const daysLeft = tenant.end_date ? Math.ceil((new Date(tenant.end_date).getTime() - Date.now()) / 86400000) : Infinity;
  if (daysLeft <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Expiring</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</span>;
}

export function LastEditedBy({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { user } = useAuth();
  const { data: log } = useLastAuditEntry(entityType, entityId);
  if (user?.role !== 'superadmin' || !log) return null;
  return (
    <p className="text-[10px] text-muted-foreground">
      Last edited by <span className="font-medium">{log.user_name}</span> · {new Date(log.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}
