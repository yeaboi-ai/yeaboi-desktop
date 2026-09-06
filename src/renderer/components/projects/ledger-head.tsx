'use client';

// The ledger's head row explains itself: the step names over a line of hollow
// dots, and while one is under the pointer its dot fills and the wide name
// column says what that run leaves for the runs after it. Nothing to unfold.
// A narrow window gets the sentences as a plain list instead (LedgerFlowList).

import { useId, useState } from 'react';
import { HOLLOW } from '@/components/projects/run-trace';
import { leavesSentence } from '@/lib/yeaboi/ledger';
import type { FlowStep } from '@/lib/yeaboi/reads';

function dotStyle(color: string, lit: boolean) {
  return lit
    ? { background: color, borderColor: color }
    : { background: 'var(--card)', borderColor: HOLLOW };
}

export function LedgerHead({
  steps,
  colors,
}: {
  steps: readonly FlowStep[];
  colors?: Record<string, string>;
}) {
  const [explained, setExplained] = useState<number | null>(null);
  const sentenceId = useId();
  if (steps.length === 0) return null;
  const step = explained === null ? null : steps[Math.min(explained, steps.length - 1)];
  return (
    <div
      className="hidden gap-x-4 pt-4 md:grid md:[grid-template-columns:var(--ledger-cols)]"
      onMouseLeave={() => setExplained(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExplained(null);
      }}
    >
      <p
        id={sentenceId}
        aria-live="polite"
        className="line-clamp-2 self-center text-[13px] font-body leading-snug text-muted-foreground"
      >
        {step && (
          <span key={step.key} className="animate-fade-in">
            {leavesSentence(step)}
          </span>
        )}
      </p>
      {steps.map((s, index) => (
        <button
          key={s.key}
          type="button"
          aria-describedby={sentenceId}
          onMouseEnter={() => setExplained(index)}
          onFocus={() => setExplained(index)}
          className="flex flex-col items-center gap-1.5 text-[11px] font-body text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <span>{s.label}</span>
          <span aria-hidden className="relative flex w-full justify-center py-[3px]">
            <span
              className="absolute top-1/2 h-px -translate-y-1/2 bg-border"
              style={{
                left: index === 0 ? '50%' : '-0.5rem',
                right: index === steps.length - 1 ? '50%' : '-0.5rem',
              }}
            />
            <span
              className="relative inline-block h-2 w-2 rounded-full border transition-colors duration-300"
              style={dotStyle(colors?.[s.key] ?? 'var(--audience-accent)', index === explained)}
            />
          </span>
        </button>
      ))}
      <span />
    </div>
  );
}

/** The same sentences as a list, for a window too narrow for the columns. */
export function LedgerFlowList({
  steps,
  colors,
}: {
  steps: readonly FlowStep[];
  colors?: Record<string, string>;
}) {
  if (steps.length === 0) return null;
  return (
    <ul className="mt-5 border-t border-border pt-4 md:hidden">
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
