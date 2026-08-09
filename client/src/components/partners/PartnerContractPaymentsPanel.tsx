import type { PartnerPayment } from '@/lib/hooks/usePartners';

export function groupPaymentsByContract(payments: PartnerPayment[]): Map<number, PartnerPayment[]> {
  const map = new Map<number, PartnerPayment[]>();
  for (const p of payments) {
    const list = map.get(p.contract_id) ?? [];
    list.push(p);
    map.set(p.contract_id, list);
  }
  return map;
}
