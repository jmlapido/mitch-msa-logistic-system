import { User, Building2, Clock } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLastAuditEntry } from '@/lib/hooks/useAuditLogs';
import type { Tenant } from '@/lib/hooks/useRentals';
import { formatDate } from '@/lib/utils';
import { isExpiring } from '@/lib/expiry';

export function TypeIcon({ type }: { type: Tenant['tenant_type'] }) {
  return type === 'company'
    ? <Building2 size={12} className="inline ml-1 text-muted-foreground" aria-label="Company" />
    : <User size={12} className="inline ml-1 text-muted-foreground" aria-label="Person" />;
}

export function ExpiringBadge({ endDate }: { endDate: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
      <Clock size={11} /> ends {formatDate(endDate)}
    </span>
  );
}

export function LeaseStatusBadge({ tenant }: { tenant: Tenant }) {
  if (!tenant.lease_id) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">No Lease</span>;
  if (isExpiring(tenant.end_date)) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Expiring</span>;
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
