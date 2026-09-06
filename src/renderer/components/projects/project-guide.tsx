'use client';

// The duck who explains projects. He stands in the header band's right half,
// above the sheet and in flow with it, so the sheet may grow and shrink
// beneath him and never meet him. Three lines, stepped by hand; Got it leaves
// a quiet duck that says them again on click.

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DuckMark, useDuckPulse } from '@/components/brand/duck';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useSeenFlag } from '@/hooks/use-seen-flag';
import {
  GOT_IT_LABEL,
  GUIDE_SEEN_KEY,
  NEXT_LABEL,
  PREV_LABEL,
  REOPEN_LABEL,
  guideLines,
  stepIndex,
} from '@/lib/yeaboi/project-guide';
import { DOCK_MAX_WIDTH } from '@/lib/yeaboi/tips';
import type { FlowStep } from '@/lib/yeaboi/reads';

const DUCK_SIZE = 72;
const QUIET_DUCK_SIZE = 40;

const STEP_BUTTON =
  'rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent';

export function ProjectGuide({ steps }: { steps: FlowStep[] }) {
  const [seen, setSeen] = useSeenFlag(GUIDE_SEEN_KEY);
  const [index, setIndex] = useState(0);
  const [duckState, pulse] = useDuckPulse('idle');
  const reduced = useReducedMotion();
  const lines = guideLines(steps);
  const line = lines[stepIndex(index, 0, lines.length)];

  // A quack as each new line lands, as the tip dock does.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    if (!reduced) pulse('card');
  }, [index, pulse, reduced]);

  if (seen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIndex(0);
          setSeen(false);
        }}
        title={REOPEN_LABEL}
        aria-label={REOPEN_LABEL}
        className="cursor-pointer border-0 bg-transparent p-0 opacity-40 transition-opacity hover:opacity-100"
        style={{ scale: '-1 1' }}
      >
        <DuckMark size={QUIET_DUCK_SIZE} />
      </button>
    );
  }

  const last = index >= lines.length - 1;

  return (
    <div className="flex items-end gap-3" aria-label={REOPEN_LABEL} role="group">
      <div
        className="relative max-w-full rounded-2xl bg-card shadow-lg ring-1 ring-border/60"
        style={{
          width: `${DOCK_MAX_WIDTH}px`,
          transformOrigin: 'bottom right',
          animation: reduced ? undefined : 'tip-bubble-in 200ms ease-out',
        }}
      >
        <p className="px-4 pt-3.5 pb-2 text-[13px] leading-snug text-foreground" aria-live="polite">
          {line}
        </p>

        {/* One row at a set height, always visible: nothing rotates, so
            nothing here needs finding in a hurry. */}
        <div className="flex h-9 items-center gap-0.5 px-2">
          <button
            type="button"
            onClick={() => setIndex((i) => stepIndex(i, -1, lines.length))}
            disabled={index === 0}
            aria-label={PREV_LABEL}
            className={STEP_BUTTON}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => stepIndex(i, 1, lines.length))}
            disabled={last}
            aria-label={NEXT_LABEL}
            className={STEP_BUTTON}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="ml-1 text-[11px] tabular-nums text-muted-foreground/60">
            {index + 1}/{lines.length}
          </span>
          <button
            type="button"
            onClick={() => setSeen(true)}
            data-audience-accented
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-secondary/60"
            style={{ color: 'var(--audience-accent)' }}
          >
            {GOT_IT_LABEL}
          </button>
        </div>

        {/* The tail, pointing right at the duck's head. Two borders only, so it
            reads as the bubble's own corner rather than a pasted square. */}
        <span
          aria-hidden
          className="absolute h-2.5 w-2.5 rotate-45 rounded-[1px] bg-card"
          style={{
            right: '-5px',
            bottom: '30px',
            borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            borderRight: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          }}
        />
      </div>

      {/* The bubble says everything he would; he stays off the a11y tree.
          Mirrored so he faces what he is saying. */}
      <span data-guide-float className="block shrink-0" style={{ scale: '-1 1' }}>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => pulse('startled')}
          className="block cursor-pointer border-0 bg-transparent p-0"
        >
          <DuckMark state={duckState} size={DUCK_SIZE} />
        </button>
      </span>
    </div>
  );
}
