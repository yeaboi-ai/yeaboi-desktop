'use client';

// A select the app draws itself.
//
// A native `<select>` opens the platform's own list — white on macOS, in the
// system's type, over a window that is neither. This is the same choice in the
// app's own popover.

import { useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface PickerOption {
  value: string;
  label: string;
  /** One line under the label, where an option needs saying more about. */
  note?: string;
  /** The group this option opens, named. A rule comes with it. */
  group?: string;
  /** A mark for the option — a provider's own, say. */
  icon?: ReactNode;
  /** A word about the option itself, worn as a chip: "recommended". */
  badge?: string;
  /** The label in the app's mono, for anything that is an id rather than a name. */
  mono?: boolean;
}

export function Picker({
  value,
  options,
  onChange,
  label,
  variant = 'field',
  className,
}: {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  /** What the list is of, for anyone who cannot see it. */
  label: string;
  /** `card` is the same list behind a row the size of the cards it replaced:
   *  the mark, the name, and what the option is, on two lines. */
  variant?: 'field' | 'card';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const picked = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              'flex w-full items-center text-left text-foreground transition-colors',
              'focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:outline-none',
              variant === 'card'
                ? 'gap-3.5 rounded-2xl bg-card px-4 py-3 ring-1 ring-border/50 hover:ring-primary/40'
                : 'gap-2 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] hover:border-border',
              className,
            )}
          >
            {variant === 'card' && picked?.icon}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate',
                  variant === 'card' ? 'text-[13.5px] font-medium' : 'text-[13px]',
                  picked?.mono && 'font-mono',
                )}
              >
                {picked?.label ?? 'Pick one'}
              </span>
              {variant === 'card' && picked?.note && (
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {picked.note}
                </span>
              )}
            </span>
            {variant === 'card' && picked?.badge && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 font-body text-[10px] text-primary">
                {picked.badge}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent side="bottom" align="start" className="w-[var(--anchor-width)] min-w-40 p-1">
        <div
          role="listbox"
          aria-label={label}
          className="flex max-h-72 flex-col gap-0.5 overflow-y-auto"
        >
          {options.map((option, index) => {
            const active = option.value === value;
            return (
              <div key={option.value}>
                {option.group && (
                  <>
                    {index > 0 && <div aria-hidden className="my-1 border-t border-border/50" />}
                    <p className="px-2.5 pt-1 pb-1 font-body text-[10px] tracking-wide text-muted-foreground/70 uppercase">
                      {option.group}
                    </p>
                  </>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150',
                    active ? 'bg-secondary/60' : 'hover:bg-secondary/40',
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-3 w-3 shrink-0',
                      active ? 'text-primary' : 'text-transparent',
                    )}
                  />
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[13px] text-foreground',
                        option.mono ? 'font-mono' : 'font-body',
                      )}
                    >
                      {option.label}
                    </span>
                    {option.note && (
                      <span className="block truncate font-body text-[11px] text-muted-foreground">
                        {option.note}
                      </span>
                    )}
                  </span>
                  {option.badge && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 font-body text-[10px] text-primary">
                      {option.badge}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
