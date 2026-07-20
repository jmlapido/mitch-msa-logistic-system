import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('p-3', className)}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('en-GB', { month: 'short' }),
      }}
      classNames={{
        months: cn('flex flex-col gap-4', defaultClassNames.months),
        month: cn('flex flex-col gap-4', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between', defaultClassNames.nav),
        button_previous: cn(buttonVariants({ variant: 'ghost' }), 'h-7 w-7 p-0'),
        button_next: cn(buttonVariants({ variant: 'ghost' }), 'h-7 w-7 p-0'),
        month_caption: cn('flex h-9 w-full items-center justify-center', defaultClassNames.month_caption),
        dropdowns: cn('flex items-center justify-center gap-1.5 text-sm font-medium', defaultClassNames.dropdowns),
        dropdown_root: cn('relative rounded-md border border-input', defaultClassNames.dropdown_root),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label' ? 'text-sm' : 'flex h-8 items-center gap-1 rounded-md px-2 text-sm',
          defaultClassNames.caption_label
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn('w-9 text-[0.8rem] font-normal text-muted-foreground', defaultClassNames.weekday),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        day: cn('h-9 w-9 p-0 text-center text-sm', defaultClassNames.day),
        today: cn('rounded-md bg-accent text-accent-foreground', defaultClassNames.today),
        outside: cn('text-muted-foreground opacity-50', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          if (orientation === 'left') return <ChevronLeft className={cn('h-4 w-4', chevronClassName)} />;
          if (orientation === 'right') return <ChevronRight className={cn('h-4 w-4', chevronClassName)} />;
          return <ChevronDown className={cn('h-4 w-4', chevronClassName)} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(
        'h-9 w-9 p-0 font-normal',
        modifiers.selected && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Calendar };
