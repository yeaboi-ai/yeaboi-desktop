'use client';

// What a surface puts away while something else takes it over.
//
// Fading in place is the whole trick, and it is easy to lose: the thing taking
// the surface grows into the space, and everything under it is shoved down the
// page mid-fade — a 400px jump, a scrollbar for the length of the animation,
// and the page clipped at the bottom while it plays. So it is pinned where it
// stood and taken out of the flow on the same frame, which hands the room over
// at once and leaves this to fade where it is.
//
// It comes off the page only when the fade is finished. Unmounting on a guess
// is what turns a fade into a blink.
//
// The parent must be positioned — `relative` — or the pin lands somewhere else
// entirely.
//
// It is a flow root, and drops its own margins when pinned, so that the box it
// is pinned *at* is the box it was measured *from*. Without the first, a
// child's top margin collapses out through this wrapper while it is in the
// flow and applies inside it once it is not — the content drops by that margin
// the moment it is pinned. Without the second, a margin the surface put on
// this wrapper is added to the pin and it drops again.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Only for a page that will not animate — reduced motion, or a browser that
 *  reports no animations at all. */
const FADE_MS = 400;

export function Displaced({ away, children }: { away: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  /** Where it stood, in the positioned parent's terms. Kept up to date while
   *  it is still in the flow: by the time it is told to go, the thing taking
   *  the surface has already grown and there is nothing left to measure. */
  const pinned = useRef(0);
  const [gone, setGone] = useState(false);

  useLayoutEffect(() => {
    if (!away) pinned.current = box.current?.offsetTop ?? pinned.current;
  });

  // Off the page when the fade is actually over, not when a timer guesses it
  // is. The calendar's own move is dozens of measurements and animations, and
  // the frame that costs runs between the class landing and the first painted
  // step — so a timer started here finishes while the fade is still half up,
  // and half up is what a blink looks like.
  useEffect(() => {
    if (!away) {
      setGone(false);
      return;
    }
    let live = true;
    const done = () => {
      if (live) setGone(true);
    };
    const running = box.current?.getAnimations() ?? [];
    if (running.length === 0) {
      const off = window.setTimeout(done, FADE_MS);
      return () => {
        live = false;
        window.clearTimeout(off);
      };
    }
    void Promise.all(running.map((one) => one.finished.catch(() => undefined))).then(done);
    return () => {
      live = false;
    };
  }, [away]);

  if (gone) return null;

  return (
    <div
      ref={box}
      aria-hidden={away || undefined}
      className={`flow-root ${away ? 'peel-out pointer-events-none absolute inset-x-0' : 'peel-in'}`}
      style={away ? { top: pinned.current, margin: 0 } : undefined}
    >
      {children}
    </div>
  );
}
