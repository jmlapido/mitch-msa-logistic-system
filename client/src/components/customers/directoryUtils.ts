import type { Tenant } from '@/lib/hooks/useRentals';

const AVATAR_COLORS = ['#4dabf7','#74c0fc','#a9e34b','#69db7c','#ffa94d','#ff6b6b','#da77f2','#63e6be'];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export type SortKey = 'name' | 'balance' | 'expiring';

const SEARCH_FIELDS = [
  'name', 'phone', 'phone_alt', 'email', 'id_number',
  'trn', 'trade_license_no', 'contact_person_name',
] as const;

export function filterCustomers(list: Tenant[], query: string): Tenant[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(t =>
    SEARCH_FIELDS.some(f => (t[f] ?? '').toLowerCase().includes(q))
  );
}

export function sortCustomers(list: Tenant[], key: SortKey): Tenant[] {
  return [...list].sort((a, b) => {
    if (key === 'name') return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (key === 'balance') return (b.total_balance ?? -1) - (a.total_balance ?? -1);
    // expiring first: no-lease last, then by end_date asc
    if (!a.end_date && !b.end_date) return 0;
    if (!a.end_date) return 1;
    if (!b.end_date) return -1;
    return a.end_date.localeCompare(b.end_date);
  });
}
