export function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function withMonth(month: string, newMonthPart: string): string {
  const [y] = month.split('-');
  return `${y}-${newMonthPart}`;
}

export function withYear(month: string, newYear: number): string {
  const [, m] = month.split('-');
  return `${newYear}-${m}`;
}

export function getYearOptions(month: string, now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  const selectedYear = Number(month.split('-')[0]);
  const min = Math.min(currentYear - 5, selectedYear);
  const max = Math.max(currentYear + 1, selectedYear);
  const years: number[] = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}
