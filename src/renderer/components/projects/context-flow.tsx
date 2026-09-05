'use client';

// The context flow as one row on the world's hairline: each step is its mode's
// dot, the mode's name, and what a run of it leaves for the runs after it. On
// a project page the fragment gives way to the fact of what is already inside.

import type { FlowStep } from '@/lib/yeaboi/reads';

export function ContextFlow({
  steps,
  colors,
  inside,
}: {
  steps: FlowStep[];
  /** The mode accents by key; the world accent stands in for a missing one. */
  colors?: Record<string, string>;
  /** What this project already holds, by key, in place of the fragment. */
  inside?: Record<string, string>;
}) {
  if (steps.length === 0) return null;
  return (
    <ul
      data-audience-accented
      className="flex flex-wrap gap-x-8 gap-y-3 pt-4"
      style={{ borderTop: '1px solid var(--audience-accent)' }}
    >
      {steps.map((step) => (
        <li key={step.key} className="flex max-w-[15rem] items-start gap-2.5">
          <span
            aria-hidden
            className="mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: colors?.[step.key] ?? 'var(--audience-accent)' }}
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-body font-medium text-foreground">
              {step.label}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
              {inside?.[step.key] ?? step.leaves}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
