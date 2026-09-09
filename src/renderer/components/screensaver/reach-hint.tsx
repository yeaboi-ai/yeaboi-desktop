'use client';

// The one thing on the screensaver that tells you it can be reached into.
//
// It has to be readable in the passive state, because that is the only moment
// it is discoverable: any pointer movement dismisses the saver, so nobody will
// ever hover it to find out. It fades to a whisper after a few seconds in CSS
// rather than on a timer — an idle screen should not be re-rendering.

import { reachHint } from '@/lib/screensaver/reach';
import { modKeyName } from '@/lib/yeaboi/palette';
import { platform } from '@/lib/yeaboi/api';

export function ReachHint({ reaching }: { reaching: boolean }) {
  const hint = reachHint(modKeyName(platform()), reaching);
  return (
    <div
      aria-hidden
      // Never eats a click meant for a story.
      className="pointer-events-none absolute right-8 bottom-6 flex select-none items-center gap-2 text-[11px] text-muted-foreground/70 motion-safe:animate-[saver-hint-settle_8s_ease-out_forwards]"
    >
      {hint.key && (
        <kbd className="rounded border border-border/70 bg-foreground/[0.06] px-1.5 py-0.5 font-mono">
          {hint.key}
        </kbd>
      )}
      <span>{hint.text}</span>
    </div>
  );
}
