'use client';

// The duck in the corner of the window, and the bubble beside him.
//
// One duck for the whole window. Pages do not draw him and do not write to
// the bubble; they offer a line to the shared voice (lib/duck-events.ts) and
// the arbiter decides whether it wins. Ported from the old shell's
// DuckChrome, restyled from app.css onto Tailwind.

import { useEffect, useState } from 'react';
import { Duck } from '@/components/brand/duck';
import { duckVoice } from '@/lib/duck-voice';

/** Frame cadence for the bubble. The line changes on human timescales, so
 *  this is a slow tick, not an animation loop. */
const TICK_MS = 200;

export function DuckChrome() {
  const voice = duckVoice();
  const [line, setLine] = useState('');
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = voice.tick();
      setLine(current?.text ?? '');
      setSticky(voice.sticky);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [voice]);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-end gap-2">
      <Duck state="idle" size={36} />
      {line && (
        <div
          // A fading quip is decoration; a sticky line is a question, and the
          // only one of the two worth handing to a screen reader.
          aria-live={sticky ? 'polite' : 'off'}
          className="mb-1 max-w-[220px] rounded-xl rounded-bl-sm border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] leading-snug text-foreground shadow-sm backdrop-blur-md"
        >
          {line}
        </div>
      )}
    </div>
  );
}
