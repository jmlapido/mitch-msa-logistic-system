export type PaymentHistoryEntry = {
  id: number;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque' | null;
  receipt_no: string | null;
  notes: string | null;
};

export type PaymentHistoryMonthRow = {
  rent_payment_id: number;
  month: string;
  expected_rent: number;
  amount_paid: number;
  status: 'collected' | 'pending' | 'overdue' | 'partial' | 'written_off';
  written_off_amount: number | null;
  written_off_reason: string | null;
};

export type PaymentHistoryMonth = PaymentHistoryMonthRow & {
  month_label: string;
  balance: number;
  entries: PaymentHistoryEntry[];
};

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(year, m - 1);
  return date.toLocaleDateString('en-AE', { month: 'short', year: 'numeric' });
}

export function buildPaymentHistory(
  rows: PaymentHistoryMonthRow[],
  entriesByRentPaymentId: Map<number, PaymentHistoryEntry[]>,
): PaymentHistoryMonth[] {
  return rows.map(row => ({
    ...row,
    month_label: formatMonthLabel(row.month),
    balance: Math.max(0, Math.round((row.expected_rent - row.amount_paid) * 100) / 100),
    entries: entriesByRentPaymentId.get(row.rent_payment_id) ?? [],
  }));
}
