export type BillRow = {
  month: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  particulars: string;
  amount: number;
  status: string;
  paid_date: string | null;
  building_name: string | null;
};

export type MonthTotal = { month: string; total: number; paid: number; unpaid: number };

export function buildYearlyCategorySummary(rows: BillRow[], year: number): MonthTotal[] {
  const months: MonthTotal[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    total: 0,
    paid: 0,
    unpaid: 0,
  }));
  const byMonth = new Map(months.map(m => [m.month, m]));
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (!entry) continue;
    entry.total += row.amount;
    if (row.status === 'paid') entry.paid += row.amount;
    else entry.unpaid += row.amount;
  }
  return months;
}
