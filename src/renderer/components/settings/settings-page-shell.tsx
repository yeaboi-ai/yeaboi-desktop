'use client';

// The frame every settings section renders inside: one header, then the
// section list beside the content. Themes keeps its own route element, so it
// wears this rather than being dispatched from the settings page.

import type { ReactNode } from 'react';
import { SettingsSectionList } from '@/components/settings/settings-section-list';
import { SETTINGS_LEAD } from '@/lib/yeaboi/settings-tabs';
import { cn } from '@/lib/utils';

export function SettingsPageShell({
  active,
  maxWidth = 'max-w-5xl',
  children,
}: {
  /** The current pathname, used to light the row. */
  active: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    // The Niko bar is fixed to the bottom of the window; the extra bottom
    // padding is what keeps the last row of a section reachable under it.
    <div className={cn('mx-auto px-6 pt-10 pb-28', maxWidth)}>
      <header className="mb-8">
        <h1 className="font-display text-[40px] leading-none text-foreground">Settings</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{SETTINGS_LEAD}</p>
      </header>

      <div className="md:grid md:grid-cols-[168px_minmax(0,1fr)] md:gap-10">
        <SettingsSectionList
          active={active}
          className="mb-6 md:mb-0 md:sticky md:top-10 md:self-start"
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
