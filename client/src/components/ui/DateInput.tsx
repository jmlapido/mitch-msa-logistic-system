import * as React from 'react';
import { cn } from '@/lib/utils';

interface DateInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
}

function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string {
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const d = match[1]!, m = match[2]!, y = match[3]!;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value = '', onChange, onBlur, className, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => isoToDisplay(value));

    React.useEffect(() => {
      setDisplay(isoToDisplay(value));
    }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value;
      setDisplay(raw);
      const iso = displayToIso(raw);
      if (iso || raw === '') onChange?.(iso);
    }

    function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
      const iso = displayToIso(e.target.value);
      if (iso) {
        setDisplay(isoToDisplay(iso));
        onChange?.(iso);
      } else if (e.target.value === '') {
        onChange?.('');
      }
      onBlur?.();
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...props}
      />
    );
  }
);

DateInput.displayName = 'DateInput';

export { DateInput };
