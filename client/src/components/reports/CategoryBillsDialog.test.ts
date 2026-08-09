import { describe, it, expect } from 'vitest';
import { buildYearlyCategorySummary, type BillRow } from './CategoryBillsDialog';

function row(overrides: Partial<BillRow>): BillRow {
  return {
    month: '2026-01',
    category_name: 'Utilities',
    category_icon: '💡',
    category_color: '#3b82f6',
    particulars: 'Electricity',
    amount: 100,
    status: 'unpaid',
    paid_date: null,
    building_name: null,
    ...overrides,
  };
}

describe('buildYearlyCategorySummary', () => {
  it('returns 12 zero-filled months when there are no rows', () => {
    const result = buildYearlyCategorySummary([], 2026);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ month: '2026-01', total: 0, paid: 0, unpaid: 0 });
    expect(result[11]).toEqual({ month: '2026-12', total: 0, paid: 0, unpaid: 0 });
  });

  it('sums a single row into its month, leaving other months at zero', () => {
    const result = buildYearlyCategorySummary([row({ month: '2026-03', amount: 250, status: 'paid' })], 2026);
    const march = result.find(m => m.month === '2026-03')!;
    expect(march).toEqual({ month: '2026-03', total: 250, paid: 250, unpaid: 0 });
    expect(result.find(m => m.month === '2026-01')).toEqual({ month: '2026-01', total: 0, paid: 0, unpaid: 0 });
  });

  it('sums multiple bills within the same month', () => {
    const result = buildYearlyCategorySummary([
      row({ month: '2026-06', amount: 100, status: 'paid' }),
      row({ month: '2026-06', amount: 50, status: 'unpaid' }),
    ], 2026);
    const june = result.find(m => m.month === '2026-06')!;
    expect(june).toEqual({ month: '2026-06', total: 150, paid: 100, unpaid: 50 });
  });

  it('splits paid vs unpaid correctly across different rows', () => {
    const result = buildYearlyCategorySummary([
      row({ month: '2026-09', amount: 300, status: 'paid' }),
      row({ month: '2026-09', amount: 75, status: 'unpaid' }),
    ], 2026);
    const sep = result.find(m => m.month === '2026-09')!;
    expect(sep.paid).toBe(300);
    expect(sep.unpaid).toBe(75);
  });

  it('ignores rows whose month falls outside the requested year', () => {
    const result = buildYearlyCategorySummary([row({ month: '2025-12', amount: 500, status: 'paid' })], 2026);
    expect(result.every(m => m.total === 0)).toBe(true);
  });
});
