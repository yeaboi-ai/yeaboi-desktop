'use client';

// The one thing on the screensaver that says it can be reached into.
//
// It has to read as an affordance, not as a watermark: any pointer movement
// dismisses the saver, so nobody will ever hover it to find out what it means,
// and it is the only chance the feature has to be discovered. Hence a real
// chip — background, border, a drawn keycap — centred under the paper rather
// than grey text in a corner.
//
// It does not fade out. Fading on a timer meant that arriving at a screen that
// had been idle for twenty minutes showed nothing at all, which is precisely
// the moment it needed to be legible.

import { reachHint } from '@/lib/screensaver/reach';
import { modKeyName } from '@/lib/yeaboi/palette';
import { platform } from '@/lib/yeaboi/api';
import { cn } from '@/lib/utils';

export function ReachHint({ reaching }: { reaching: boolean }) {
  const hint = reachHint(modKeyName(platform()), reaching);
  return (
    <div
      aria-hidden
      // Never eats a click meant for a story.
      className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
    >
      <span
        className={cn(
          'flex select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] shadow-sm backdrop-blur-sm transition-colors',
          reaching
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/70 bg-card/85 text-muted-foreground',
        )}
      >
        {hint.key && (
          <kbd className="rounded border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-[12px] leading-none text-foreground shadow-[0_1px_0_var(--border)]">
            {hint.key}
          </kbd>
        )}
        {hint.text}
      </span>
    </div>
  );
}
