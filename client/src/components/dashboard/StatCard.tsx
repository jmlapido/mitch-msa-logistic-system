import { type LucideIcon } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: 'green' | 'red' | 'yellow' | 'blue' | 'default';
  sub?: string;
};

const COLOR_MAP = {
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  blue: 'text-blue-600 dark:text-blue-400',
  default: 'text-foreground',
};

export function StatCard({ label, value, icon: Icon, color = 'default', sub }: Props) {
  return (
    <div className="bg-card border rounded-lg p-4 flex items-start gap-3">
      <div className="bg-muted rounded-md p-2 shrink-0">
        <Icon size={18} className={COLOR_MAP[color]} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold truncate ${COLOR_MAP[color]}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
