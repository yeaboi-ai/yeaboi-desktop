'use client';

// The frame every settings tab renders inside: one header. Themes keeps its
// own route element, so it wears this rather than being dispatched from the
// settings page.
//
// The sections used to be a strip of tabs across the top. They are the rail's
// now — the window was carrying two navigations at once, one down the side for
// where you are and one above the content for where you are within it, and the
// rail was already the surface that answers both. So the heading takes over
// the one job the strip did besides navigating: saying which section this is.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALL_SETTINGS_TABS } from '@/lib/yeaboi/settings-tabs';
import { cn } from '@/lib/utils';

export function SettingsPageShell({
  active,
  maxWidth = 'max-w-[1360px]',
  children,
}: {
  /** The current pathname, which names the section. */
  active: string;
  /** Capped where a tab is one column of prose rather than a set of cards. */
  maxWidth?: string;
  children: ReactNode;
}) {
  const tab = ALL_SETTINGS_TABS.find(
    (one) => active === one.route || active.startsWith(`${one.route}/`),
  );

  // How tall the heading is, published as a variable: a tab with a toolbar of
  // its own sticks it directly under the heading, and the heading's height is
  // the only thing that says where that is.
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
    // The tab scrolls in here, not the window: the deck clips at the port, so a
    // page taller than it — a provider panel opened, a long System column —
    // simply lost its foot with no way to reach it. The scroller is the whole
    // page area rather than the column of content on it, so the wheel works in
    // the margins either side too.
    //
    // It runs to the foot of the window rather than stopping above the dock:
    // content cut off on a straight line reads as a page that ended. The
    // negative margin gives back the clearance the deck holds for the dock,
    // and what fills it is a fade rather than a cut.
    <div
      className="relative -mb-[var(--dock-clear)] flex min-h-0 flex-1 flex-col"
      style={{ '--settings-head': `${headHeight}px` } as React.CSSProperties}
    >
      {/* `data-scrollport`: the chrome's scroll rail follows whichever port
          the page in front of it has marked. */}
      <div
        data-scrollport
        className="quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* The dock and the Niko bar float over the foot of the window; the
            bottom padding is what keeps the last row of a tab reachable above
            them.

            `w-full` is load-bearing: the deck lays its pages out as a column of
            flex items, and `margin: auto` on one of those sizes it to its
            content instead of stretching it. Without this the page was as wide
            as whatever happened to be on it — Credentials sat narrower than
            every other tab, and opening a card widened the surface under the
            cursor. */}
        <div className={cn('mx-auto w-full px-6 pb-[calc(var(--dock-clear)+2rem)]', maxWidth)}>
          {/* The heading stays while the tab scrolls under it: it is the only
              thing on the page that says which section this is, and a long tab
              scrolled it away. Widened past the column and given the page's own
              background so nothing shows through beside it. */}
          <header
            ref={head}
            className="pin-fade sticky top-0 z-10 -mx-6 mb-4 bg-background px-6 pt-10 pb-4"
          >
            <p className="text-[10px] font-body font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Settings
            </p>
            <h1 className="font-display mt-0.5 text-3xl text-foreground">
              {tab?.title ?? 'Settings'}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              One config behind every surface — this window, the terminal, and the agents.
            </p>
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
