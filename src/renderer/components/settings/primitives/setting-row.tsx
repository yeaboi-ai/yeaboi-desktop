'use client';

// One row of the config: what it is called, and what it is set to.

import * as React from 'react';
import { cn } from '@/lib/utils';

export function SettingRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start gap-x-4 gap-y-2 px-[var(--card-gutter,1.25rem)] py-2.5', className)}>
      <div className="w-40 shrink-0 pt-1 text-[12px] font-body leading-tight text-muted-foreground">
        {label}
      </div>
      <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A value the user has set, or the default standing in for it. */
export function RowValue({
  value,
  fallback,
  tone = 'auto',
}: {
  value: string;
  fallback?: string;
  tone?: 'auto' | 'muted' | 'success' | 'warning';
}) {
  const empty = !value;
  return (
    <span
      className={cn(
        'font-mono text-[12px] break-all',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'auto' && (empty ? 'text-muted-foreground/50' : 'text-foreground'),
      )}
    >
      {empty ? (fallback ?? 'not set') : value}
    </span>
  );
}

/** The choice control: one pill per allowed value, the active one lit. */
export function ChoicePills({
  options,
  active,
  labels,
  onPick,
  disabled,
}: {
  options: readonly string[];
  active: string;
  labels?: Record<string, string>;
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = opt === active;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onPick(opt)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-body transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
              on
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
            )}
          >
            {labels?.[opt] ?? opt}
          </button>
        );
      })}
    </span>
  );
}
