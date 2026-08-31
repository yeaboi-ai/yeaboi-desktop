'use client';

// The frame every settings tab renders inside: one header, one tab bar. Themes
// keeps its own route element, so it wears this rather than being dispatched
// from the settings page.

import type { ReactNode } from 'react';
import { SettingsTabBar } from '@/components/settings/settings-tab-bar';
import { cn } from '@/lib/utils';

export function SettingsPageShell({
  active,
  maxWidth = 'max-w-3xl',
  children,
}: {
  /** The current pathname, used to light the tab. */
  active: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    // The Niko bar is fixed to the bottom of the window; the extra bottom
    // padding is what keeps the last row of a tab reachable under it.
    <div className={cn('mx-auto px-6 pt-10 pb-28', maxWidth)}>
      <header className="mb-7">
        <p className="text-[10px] font-body font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Configuration
        </p>
        <h1 className="font-display mt-0.5 text-3xl text-foreground">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          One config behind every surface — this window, the terminal, and the agents.
        </p>
      </header>

      <SettingsTabBar active={active} />

      {children}
    </div>
  );
}
