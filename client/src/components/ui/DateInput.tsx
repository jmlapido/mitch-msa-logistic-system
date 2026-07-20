import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Calendar } from './calendar';

interface DateInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
}

export function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function getCalendarYearRange(value: string, now: Date = new Date()): { fromYear: number; toYear: number } {
  const currentYear = now.getFullYear();
  const defaultFrom = currentYear - 10;
  const defaultTo = currentYear + 10;
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value ?? '');
  if (!match) return { fromYear: defaultFrom, toYear: defaultTo };
  const selectedYear = Number(match[1]);
  return {
    fromYear: Math.min(defaultFrom, selectedYear),
    toYear: Math.max(defaultTo, selectedYear),
  };
}

function isoToDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DateInput = React.forwardRef<HTMLButtonElement, DateInputProps>(
  ({ value = '', onChange, onBlur, className, disabled, id, name }, ref) => {
    const [open, setOpen] = React.useState(false);
    const { fromYear, toYear } = getCalendarYearRange(value);
    const selectedDate = isoToDate(value);

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={id}
            name={name}
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
              !value && 'text-muted-foreground',
              className
            )}
          >
            {value ? isoToDisplay(value) : 'Select date'}
            <CalendarIcon className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear, 11)}
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                onChange?.(dateToIso(date));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }
);

DateInput.displayName = 'DateInput';

export { DateInput };
