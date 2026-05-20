import { type LucideIcon } from 'lucide-react';

export type DeltaDirection = 'up' | 'down' | 'neutral';

export type Delta = { value: string; direction: DeltaDirection };

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: 'green' | 'red' | 'yellow' | 'blue' | 'default' | 'teal' | 'purple' | 'rose';
  delta?: Delta;
  onClick?: () => void;
};

const COLOR_MAP = {
  green:   'text-green-600 dark:text-green-400',
  red:     'text-red-600 dark:text-red-400',
  yellow:  'text-yellow-600 dark:text-yellow-400',
  blue:    'text-blue-600 dark:text-blue-400',
  teal:    'text-teal-600 dark:text-teal-400',
  purple:  'text-purple-600 dark:text-purple-400',
  rose:    'text-rose-600 dark:text-rose-400',
  default: 'text-foreground',
};

const BORDER_MAP = {
  green:   'border-t-green-500',
  red:     'border-t-red-500',
  yellow:  'border-t-yellow-500',
  blue:    'border-t-blue-500',
  teal:    'border-t-teal-500',
  purple:  'border-t-purple-500',
  rose:    'border-t-rose-500',
  default: 'border-t-border',
};

export function deltaClass(direction: DeltaDirection): string {
  if (direction === 'up')      return 'text-green-600 dark:text-green-400';
  if (direction === 'down')    return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

export function StatCard({ label, value, icon: Icon, color = 'default', delta, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={[
        'w-full text-left bg-card rounded-lg p-4 flex items-start gap-3 border-b border-l border-r border-t-2',
        BORDER_MAP[color],
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="bg-muted rounded-md p-2 shrink-0">
        <Icon size={18} className={COLOR_MAP[color]} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold truncate ${COLOR_MAP[color]}`}>{value}</p>
        {delta && (
          <p className={`text-xs mt-0.5 ${deltaClass(delta.direction)}`}>{delta.value}</p>
        )}
      </div>
    </Tag>
  );
}
