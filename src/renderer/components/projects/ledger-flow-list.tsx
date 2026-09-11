'use client';

// Under the ledger: what each step of the flow leaves for the steps after it.
// One line per step, always spelled out — there are no per-session dots to
// head, so the flow explains itself in words or not at all.

import { leavesSentence } from '@/lib/yeaboi/ledger';
import type { FlowStep } from '@/lib/yeaboi/reads';

export function LedgerFlowList({
  steps,
  colors,
}: {
  steps: readonly FlowStep[];
  colors?: Record<string, string>;
}) {
  if (steps.length === 0) return null;
  return (
    <ul className="mt-5 border-t border-border pt-4">
      {steps.map((step) => (
        <li
          key={step.key}
          className="flex items-baseline gap-x-2.5 py-1.5 text-[13px] font-body leading-snug text-muted-foreground"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 self-center rounded-full"
            style={{ background: colors?.[step.key] ?? 'var(--audience-accent)' }}
          />
          {leavesSentence(step)}
        </li>
      ))}
    </ul>
  );
}
