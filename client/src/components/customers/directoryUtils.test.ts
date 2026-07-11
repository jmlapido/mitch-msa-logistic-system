import { describe, it, expect } from 'vitest';
import { filterCustomers, sortCustomers, avatarColor } from './directoryUtils';
import type { Tenant } from '@/lib/hooks/useRentals';

function t(partial: Partial<Tenant>): Tenant {
  return { id: 1, name: 'X', tenant_type: 'person', ...partial } as Tenant;
}

describe('filterCustomers', () => {
  const list = [
    t({ id: 1, name: 'Ahmed Ali', phone: '0501112222', id_number: '784-1111' }),
    t({ id: 2, name: 'Smoke Trading LLC', tenant_type: 'company', trn: '100200300', trade_license_no: 'TL-9', contact_person_name: 'Jane Doe' }),
    t({ id: 3, name: 'Maryam', phone_alt: '043334444', email: 'maryam@example.com' }),
  ];

  it('returns the list unchanged for an empty or whitespace query', () => {
    expect(filterCustomers(list, '')).toEqual(list);
    expect(filterCustomers(list, '   ')).toEqual(list);
  });

  it('matches name case-insensitively', () => {
    expect(filterCustomers(list, 'ahmed').map(x => x.id)).toEqual([1]);
    expect(filterCustomers(list, 'SMOKE').map(x => x.id)).toEqual([2]);
  });

  it('matches phone, phone_alt, email, id_number', () => {
    expect(filterCustomers(list, '0501112222').map(x => x.id)).toEqual([1]);
    expect(filterCustomers(list, '04333').map(x => x.id)).toEqual([3]);
    expect(filterCustomers(list, 'maryam@').map(x => x.id)).toEqual([3]);
    expect(filterCustomers(list, '784-1111').map(x => x.id)).toEqual([1]);
  });

  it('matches company fields: trn, trade_license_no, contact person', () => {
    expect(filterCustomers(list, '100200300').map(x => x.id)).toEqual([2]);
    expect(filterCustomers(list, 'tl-9').map(x => x.id)).toEqual([2]);
    expect(filterCustomers(list, 'jane').map(x => x.id)).toEqual([2]);
  });

  it('returns empty when nothing matches', () => {
    expect(filterCustomers(list, 'zzz')).toEqual([]);
  });
});

describe('sortCustomers', () => {
  const list = [
    t({ id: 1, name: 'Charlie', total_balance: 100, lease_id: 1, end_date: '2027-01-01' }),
    t({ id: 2, name: 'alpha', total_balance: 0, lease_id: 2, end_date: '2026-08-01' }),
    t({ id: 3, name: 'Bravo' }), // no lease, no balance
  ];

  it('sorts by name (locale, case-insensitive)', () => {
    expect(sortCustomers(list, 'name').map(x => x.id)).toEqual([2, 3, 1]);
  });

  it('sorts by balance descending, missing balance last', () => {
    expect(sortCustomers(list, 'balance').map(x => x.id)).toEqual([1, 2, 3]);
  });

  it('sorts expiring first: earliest end_date first, no-lease last', () => {
    expect(sortCustomers(list, 'expiring').map(x => x.id)).toEqual([2, 1, 3]);
  });

  it('does not mutate the input', () => {
    const before = list.map(x => x.id);
    sortCustomers(list, 'name');
    expect(list.map(x => x.id)).toEqual(before);
  });
});

describe('avatarColor', () => {
  it('is deterministic and returns a hex color', () => {
    expect(avatarColor('Ahmed')).toBe(avatarColor('Ahmed'));
    expect(avatarColor('Ahmed')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
