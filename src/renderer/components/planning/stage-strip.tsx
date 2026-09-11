'use client';

// The plan as the conversation walks it: six words, the live one in the
// foreground with the world's hairline under it. No separators.

import { STAGE_WORDS } from '@/lib/planning/stages';
import { cn } from '@/lib/utils';

export function StageStrip({ step }: { step: number }) {
  return (
    <ol
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1"
      aria-label="Where the plan stands"
    >
      {STAGE_WORDS.map((word, index) => {
        const live = index === step;
        const done = index < step;
        return (
          <li
            key={word}
            aria-current={live ? 'step' : undefined}
            className={cn(
              'pb-1 text-[12px] font-body transition-colors',
              live
                ? 'text-foreground'
                : done
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/50',
            )}
            style={live ? { boxShadow: 'inset 0 -1px 0 var(--audience-accent)' } : undefined}
          >
            {word}
          </li>
        );
      })}
    </ol>
  );
}
