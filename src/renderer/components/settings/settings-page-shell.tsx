'use client';

// The frame every settings section renders inside: one header, then the
// section list beside the content. Every section wears the same PageShell so
// switching sections never moves the header, the list or the scrollbar.

import type { ReactNode } from 'react';
import { PageShell } from '@/components/page-shell';
import { SettingsSectionList } from '@/components/settings/settings-section-list';
import { SETTINGS_LEAD } from '@/lib/yeaboi/settings-tabs';

export function SettingsPageShell({
  active,
  children,
}: {
  /** The current pathname, used to light the row. */
  active: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
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
    </PageShell>
  );
}
