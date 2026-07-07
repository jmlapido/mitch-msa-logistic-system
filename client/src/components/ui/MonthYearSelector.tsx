import { ChevronLeft, ChevronRight } from 'lucide-react';

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

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const value = String(i + 1).padStart(2, '0');
  const label = new Intl.DateTimeFormat('en-AE', { month: 'long' }).format(new Date(2000, i, 1));
  return { value, label };
});

interface MonthYearSelectorProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthYearSelector({ month, onChange }: MonthYearSelectorProps) {
  const [year, monthPart] = month.split('-');
  const years = getYearOptions(month);

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(stepMonth(month, -1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
        <ChevronLeft size={20} />
      </button>
      <select
        value={monthPart}
        onChange={e => onChange(withMonth(month, e.target.value))}
        className="text-xs px-2 py-1 rounded border bg-background border-border"
      >
        {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select
        value={year}
        onChange={e => onChange(withYear(month, Number(e.target.value)))}
        className="text-xs px-2 py-1 rounded border bg-background border-border"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={() => onChange(stepMonth(month, 1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
