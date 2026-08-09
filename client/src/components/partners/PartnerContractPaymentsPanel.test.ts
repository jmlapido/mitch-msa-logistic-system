import { describe, it, expect } from 'vitest';
import { groupPaymentsByContract } from './PartnerContractPaymentsPanel';
import type { PartnerPayment } from '@/lib/hooks/usePartners';

function payment(overrides: Partial<PartnerPayment>): PartnerPayment {
  return {
    id: 1,
    partner_id: 1,
    contract_id: 1,
    amount: 1000,
    paid_date: '2026-01-15',
    payment_method: 'cash',
    created_at: '2026-01-15T00:00:00Z',
    contract_start: '2026-01-01',
    contract_end: '2026-12-31',
    expected_amount: 12000,
    attachments: [],
    ...overrides,
  };
}

describe('groupPaymentsByContract', () => {
  it('returns an empty map for no payments', () => {
    expect(groupPaymentsByContract([])).toEqual(new Map());
  });

  it('groups payments belonging to different contracts into separate buckets', () => {
    const a = payment({ id: 1, contract_id: 10, amount: 500 });
    const b = payment({ id: 2, contract_id: 20, amount: 700 });
    const result = groupPaymentsByContract([a, b]);
    expect(result.get(10)).toEqual([a]);
    expect(result.get(20)).toEqual([b]);
  });

  it('keeps multiple payments for the same contract in one bucket, in order', () => {
    const a = payment({ id: 1, contract_id: 10, amount: 500, paid_date: '2026-01-01' });
    const b = payment({ id: 2, contract_id: 10, amount: 300, paid_date: '2026-02-01' });
    const result = groupPaymentsByContract([a, b]);
    expect(result.get(10)).toEqual([a, b]);
  });

  it('does not create a bucket for a contract with no payments', () => {
    const result = groupPaymentsByContract([payment({ contract_id: 10 })]);
    expect(result.has(99)).toBe(false);
  });
});
