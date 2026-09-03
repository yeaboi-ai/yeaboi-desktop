'use client';

// The frame every settings tab renders inside: one header, one tab bar. The
// header names the group the tab is in — Settings, or About this app — so the
// four About pages read as part of one place. Themes keeps its own route
// element, so it wears this rather than being dispatched from the settings
// page.

import type { ReactNode } from 'react';
import { SettingsTabBar } from '@/components/settings/settings-tab-bar';
import { SETTINGS_TAB_GROUPS, settingsGroupFor } from '@/lib/yeaboi/settings-tabs';
import { cn } from '@/lib/utils';

export function SettingsPageShell({
  active,
  maxWidth = 'max-w-3xl',
  children,
}: {
  /** The current pathname, used to light the tab and name the group. */
  active: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  const groupKey = settingsGroupFor(active);
  const group = SETTINGS_TAB_GROUPS.find((g) => g.key === groupKey) ?? SETTINGS_TAB_GROUPS[0]!;
  return (
    // The Niko bar is fixed to the bottom of the window; the extra bottom
    // padding is what keeps the last row of a tab reachable under it.
    <div className={cn('mx-auto px-6 pt-10 pb-28', maxWidth)}>
      <header className="mb-7">
        <h1 className="font-display text-[40px] leading-none text-foreground">{group.title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{group.lead}</p>
      </header>

      <SettingsTabBar active={active} />

      {children}
    </div>
  );
}
