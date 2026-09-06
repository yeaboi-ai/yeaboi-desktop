'use client';

// The frame a full-window page renders inside: its own scroller, a heading
// that stays while the page moves under it, and a foot that dissolves into
// the dock rather than being cut off by it.
//
// The page scrolls in here, not the window: the deck clips at the port, so a
// page taller than it simply lost its foot with no way to reach it. The
// scroller is the whole page area rather than the column of content on it, so
// the wheel works in the margins either side too.

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function PageShell({
  header,
  maxWidth = 'max-w-[1360px]',
  children,
}: {
  /** What stays pinned at the top while the page scrolls under it. */
  header: ReactNode;
  /** Capped where a page is one column of prose rather than a set of cards. */
  maxWidth?: string;
  children: ReactNode;
}) {
  // How tall the heading is, published as `--page-head`: a page with a toolbar
  // of its own sticks it directly under the heading.
  const head = useRef<HTMLElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useEffect(() => {
    const box = head.current;
    if (!box) return;
    const watch = new ResizeObserver(() => setHeadHeight(box.offsetHeight));
    watch.observe(box);
    setHeadHeight(box.offsetHeight);
    return () => watch.disconnect();
  }, []);

  return (
    // The negative margin gives back the clearance the deck holds for the
    // dock, so the page runs to the foot of the window; what fills it is a
    // fade rather than a cut.
    <div
      className="relative -mb-[var(--dock-clear)] flex min-h-0 flex-1 flex-col"
      style={{ '--page-head': `${headHeight}px` } as React.CSSProperties}
    >
      {/* `data-scrollport`: the chrome's scroll rail follows whichever port
          the page in front of it has marked. */}
      <div
        data-scrollport
        className="quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* The dock and the Niko bar float over the foot of the window; the
            bottom padding is what keeps the last row reachable above them.

            `w-full` is load-bearing: the deck lays its pages out as a column of
            flex items, and `margin: auto` on one of those sizes it to its
            content instead of stretching it. */}
        <div className={cn('mx-auto w-full px-6 pb-[calc(var(--dock-clear)+2rem)]', maxWidth)}>
          {/* Widened past the column and given the page's own background so
              nothing shows through beside it. */}
          <header
            ref={head}
            className="pin-fade sticky top-0 z-10 -mx-6 mb-4 bg-background px-6 pt-10 pb-4"
          >
            {header}
          </header>

          {children}
        </div>
      </div>

      {/* What the page dissolves into at the foot of the window. Under the
          dock's own layer, so the controls stay sharp on top of it. */}
      <div
        aria-hidden
        className="scroll-fade pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[var(--dock-clear)]"
      />
    </div>
  );
}
