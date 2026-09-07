'use client';

// The duck who explains projects. He stands in the header band's right half,
// above the sheet and in flow with it, so the sheet may grow and shrink
// beneath him and never meet him. Three pages, stepped by hand; Got it leaves
// a quiet duck that says them again on click.

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DuckMark, useDuckPulse } from '@/components/brand/duck';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useSeenFlag } from '@/hooks/use-seen-flag';
import {
  GOT_IT_LABEL,
  GUIDE_SEEN_KEY,
  NEXT_LABEL,
  PAGE_LABEL,
  REOPEN_LABEL,
  guidePages,
  relatedLine,
  stepIndex,
  type GuideItem,
} from '@/lib/yeaboi/project-guide';
import type { FlowStep } from '@/lib/yeaboi/reads';

const DUCK_SIZE = 72;
const QUIET_DUCK_SIZE = 40;
const BUBBLE_WIDTH = 372;

/** The steps and their parts, each under the dot the ledger's head row gives it. */
function RelatedList({
  items,
  colors,
  steps,
}: {
  items: GuideItem[];
  colors: Record<string, string>;
  steps: FlowStep[];
}) {
  return (
    <ul
      className="mt-2.5 grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2 gap-y-1"
      aria-label={relatedLine(steps)}
    >
      {items.map((item) => (
        <li key={item.key} className="contents">
          <span className="flex items-baseline gap-2 font-display text-[15px] leading-snug text-foreground">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
              style={{ background: colors[item.key] ?? 'var(--muted-foreground)' }}
            />
            {item.label}
          </span>
          <span className="text-[12.5px] font-body leading-snug text-muted-foreground">
            {item.clause}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProjectGuide({
  steps,
  colors = {},
}: {
  steps: FlowStep[];
  /** Step key → accent, as the ledger's dots read it. */
  colors?: Record<string, string>;
}) {
  const [seen, setSeen] = useSeenFlag(GUIDE_SEEN_KEY);
  const [index, setIndex] = useState(0);
  const [duckState, pulse] = useDuckPulse('idle');
  const reduced = useReducedMotion();
  const pages = guidePages(steps);
  const page = pages[stepIndex(index, 0, pages.length)]!;

  // A quack as each new page lands, as the tip dock does.
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

  const last = index >= pages.length - 1;

  return (
    <div className="flex items-end gap-4" aria-label={REOPEN_LABEL} role="group">
      <div
        className="relative max-w-full rounded-2xl bg-card shadow-lg ring-1 ring-border/60"
        style={{
          width: `${BUBBLE_WIDTH}px`,
          transformOrigin: 'bottom right',
          animation: reduced ? undefined : 'tip-bubble-in 200ms ease-out',
        }}
      >
        <div className="px-5 pt-4 pb-1" aria-live="polite">
          <p className="font-display italic text-[22px] leading-none text-foreground">
            {page.title}
          </p>
          {page.body && (
            <p className="mt-2 text-[13px] font-body leading-relaxed text-muted-foreground">
              {page.body}
            </p>
          )}
          {page.items && <RelatedList items={page.items} colors={colors} steps={steps} />}
        </div>

        {/* One row at a set height: the page dots, and the one thing to do next. */}
        <div className="flex h-11 items-center px-5">
          <div className="flex items-center gap-2" role="tablist" aria-label={REOPEN_LABEL}>
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={PAGE_LABEL(i + 1)}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? 'w-4 bg-foreground'
                    : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground'
                }`}
              />
            ))}
          </div>
          {last ? (
            <button
              type="button"
              onClick={() => setSeen(true)}
              data-audience-accented
              className="ml-auto rounded-md px-2 py-1 font-display text-[16px] transition-colors hover:bg-secondary/60"
              style={{ color: 'var(--audience-accent)' }}
            >
              {GOT_IT_LABEL}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => stepIndex(i, 1, pages.length))}
              className="ml-auto inline-flex items-center gap-0.5 rounded-md py-1 pr-1 pl-2 font-display text-[16px] text-foreground/80 transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              {NEXT_LABEL}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* The tail, pointing right at the duck's head. Two borders only, so it
            reads as the bubble's own corner rather than a pasted square. */}
        <span
          aria-hidden
          className="absolute h-2.5 w-2.5 rotate-45 rounded-[1px] bg-card"
          style={{
            right: '-5px',
            bottom: '34px',
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
