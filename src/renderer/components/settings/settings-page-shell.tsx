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

import type { ReactNode } from 'react';
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

  return (
    // The tab scrolls in here, not the window: the deck clips at the port, so a
    // page taller than it — a provider panel opened, a long System column —
    // simply lost its foot with no way to reach it. The scroller is the whole
    // page area rather than the column of content on it, so the wheel works in
    // the margins either side too.
    <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* The Niko bar is fixed to the bottom of the window; the extra bottom
          padding is what keeps the last row of a tab reachable under it.

          `w-full` is load-bearing: the deck lays its pages out as a column of
          flex items, and `margin: auto` on one of those sizes it to its
          content instead of stretching it. Without this the page was as wide
          as whatever happened to be on it — Credentials sat narrower than
          every other tab, and opening a card widened the surface under the
          cursor. */}
      <div className={cn('mx-auto w-full px-6 pt-10 pb-28', maxWidth)}>
        <header className="mb-7">
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
  );
}
