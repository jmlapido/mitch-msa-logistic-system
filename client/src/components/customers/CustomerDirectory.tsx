import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenants, type Tenant } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { AedAmount } from '@/components/ui/AedAmount';
import { formatDate } from '@/lib/utils';
import { filterCustomers, sortCustomers, avatarColor, type SortKey } from './directoryUtils';
import { LeaseStatusBadge, TypeIcon } from './badges';
import { CustomerFormDialog } from './CustomerFormDialog';

export function CustomerDirectory() {
  const { data: tenants = [], isLoading } = useTenants();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [formOpen, setFormOpen] = useState(false);

  const visible = sortCustomers(filterCustomers(tenants, query), sortKey);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, phone, ID, TRN, license…"
            className="pl-8"
          />
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="text-xs border rounded px-2 py-2 bg-background text-foreground"
        >
          <option value="name">Sort: Name</option>
          <option value="balance">Sort: Balance</option>
          <option value="expiring">Sort: Expiring First</option>
        </select>
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <Button size="sm" onClick={() => setFormOpen(true)}><Plus size={14} className="mr-1" /> Add Customer</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No customers match</p>
      ) : (
        <div className="border rounded-lg divide-y overflow-hidden">
          {visible.map((t: Tenant) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
              onClick={() => navigate(`/customers?id=${t.id}`)}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: avatarColor(t.name) }}
              >
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm capitalize">
                  {t.name}
                  <TypeIcon type={t.tenant_type} />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.units_summary ?? 'No unit assigned'}
                  {t.phone && <span className="ml-2">{t.phone}</span>}
                </div>
                {(t.total_balance ?? 0) > 0 && (
                  <div className="text-xs text-red-600 font-medium"><AedAmount amount={t.total_balance!} /> balance due</div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {(t.annual_rent || t.monthly_rent) && (
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold"><AedAmount amount={t.monthly_rent!} /><span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                    {t.end_date && <div className="text-xs text-muted-foreground">until {formatDate(t.end_date)}</div>}
                  </div>
                )}
                <LeaseStatusBadge tenant={t} />
                <span className="text-muted-foreground text-xs">›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <CustomerFormDialog open={formOpen} editing={null} onClose={() => setFormOpen(false)} />
    </div>
  );
}
