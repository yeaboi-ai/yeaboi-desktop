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
import { PageShell } from '@/components/ui/page-shell';

export function SettingsPageShell({
  active,
  maxWidth,
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
    <PageShell
      maxWidth={maxWidth}
      header={
        <>
          <p className="font-body text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="font-display mt-0.5 text-3xl text-foreground">
            {tab?.title ?? 'Settings'}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            One config behind every surface — this window, the terminal, and the agents.
          </p>
        </>
      }
    >
      {children}
    </PageShell>
  );
}
