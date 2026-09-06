'use client';

// How far a project has walked the flow: one dot per step, filled where a run
// of that mode has happened inside it, hollow where none has. The ledger puts
// the dots in the columns under the step names; a narrow window spells the
// labels out. Same order and colours as the flow line at the sheet's foot,
// so a row is read against the steps it names.

import { traceSentence, type TraceStep } from '@/lib/yeaboi/projects';

/** Each dot's fill arrives a beat after the last, in flow order. */
const FILL_STAGGER_MS = 40;
/** A step still to come: an outline the card cannot swallow. */
export const HOLLOW = 'color-mix(in srgb, var(--muted-foreground) 55%, transparent)';

function dotStyle(step: TraceStep, colors: Record<string, string> | undefined, index: number) {
  const color = colors?.[step.key] ?? 'var(--audience-accent)';
  return step.ran
    ? { background: color, borderColor: color, transitionDelay: `${index * FILL_STAGGER_MS}ms` }
    : { background: 'transparent', borderColor: HOLLOW, transitionDelay: '0ms' };
}

export function RunTrace({
  trace,
  colors,
  variant = 'labelled',
}: {
  trace: TraceStep[];
  colors?: Record<string, string>;
  /** `dots` renders one cell per step for a grid row; `labelled` a wrapped line of dot and name. */
  variant?: 'dots' | 'labelled';
}) {
  if (trace.length === 0) return null;
  if (variant === 'dots') {
    return (
      <>
        {trace.map((step, index) => (
          <span key={step.key} className="flex justify-center self-start pt-[7px]" aria-hidden>
            <span
              className="inline-block h-2 w-2 rounded-full border transition-colors duration-300"
              style={dotStyle(step, colors, index)}
            />
          </span>
        ))}
      </>
    );
  }
  return (
    <span
      role="img"
      aria-label={traceSentence(trace)}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-body"
    >
      {trace.map((step, index) => (
        <span key={step.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border transition-colors duration-300"
            style={dotStyle(step, colors, index)}
          />
          <span className={step.ran ? 'text-foreground/80' : 'text-muted-foreground/60'}>
            {step.label}
          </span>
        </span>
      ))}
    </span>
  );
}
