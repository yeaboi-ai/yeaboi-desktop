'use client';

// A choice between a few named options, as one control rather than a row of
// pills: the mark slides from the old option to the new, so the change reads
// as a move rather than as two things repainting.

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export function Segmented({
  options,
  value,
  labels,
  onPick,
  disabled,
  className,
  label,
}: {
  options: readonly string[];
  value: string;
  labels?: Record<string, string>;
  onPick: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** What the choice is of, for anyone who cannot see it. */
  label: string;
}) {
  // The mark is measured off the button it is on rather than given a share of
  // the row: "api key" and "subscription" are not the same width, and a mark
  // that assumes they are sits over neither.
  const row = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null);
  const at = Math.max(0, options.indexOf(value));

  useEffect(() => {
    const box = row.current;
    if (!box) return;
    const take = () => {
      const button = box.querySelectorAll<HTMLElement>('[role="radio"]')[at];
      if (button) setMark({ left: button.offsetLeft, width: button.offsetWidth });
    };
    take();
    const watch = new ResizeObserver(take);
    watch.observe(box);
    return () => watch.disconnect();
  }, [at, options.length]);

  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label={label}
      className={cn(
        'relative inline-flex rounded-full bg-secondary/50 p-0.5 ring-1 ring-border/40',
        disabled && 'opacity-50',
        className,
      )}
    >
      {mark && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0 rounded-full bg-primary/15 ring-1 ring-primary/30 transition-[transform,width] duration-200 ease-out"
          style={{ width: mark.width, transform: `translateX(${mark.left}px)` }}
        />
      )}
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            // Picking what is already picked is not a change: it used to save
            // the same value again and say so.
            onClick={() => !on && onPick(option)}
            className={cn(
              'relative z-10 rounded-full px-3.5 py-1 font-body text-[11px] whitespace-nowrap transition-colors duration-200 outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              on ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {labels?.[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}
