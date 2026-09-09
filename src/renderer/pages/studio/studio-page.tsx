'use client';

// Studio: how blueprints, planning sessions, agents and tickets are shaped
// before a session ever starts. The section the page shows is the `:area`
// segment, so every panel is a link somebody can keep.
//
// The frame is the settings frame — PageShell, a section list in the left
// column, the panel in the right — because Studio and Settings are the two
// configuration surfaces and switching between their sections must not move
// the header or the scrollbar.

import { useParams } from 'react-router';
import { PageShell } from '@/components/page-shell';
import { StudioSectionList } from '@/components/studio/studio-section-list';
import { StudioShell } from '@/components/studio/studio-shell';
import { useProviderHealth } from '@/hooks/use-provider-health';
import { itemForSegment, STUDIO_LEAD } from '@/lib/yeaboi/studio-areas';

export default function StudioPage() {
  const { area } = useParams<{ area?: string }>();
  const item = itemForSegment(area);
  const { video: videoHealth } = useProviderHealth();

  return (
    <PageShell>
      <header className="mb-8">
        <h1 className="font-display text-[40px] leading-none text-foreground">Studio</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{STUDIO_LEAD}</p>
        {!videoHealth.available && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-600 dark:text-amber-200/80">
            Video personas are temporarily unavailable:{' '}
            {videoHealth.message || 'an upstream provider is failing.'}
            {videoHealth.blocking_provider ? ` (${videoHealth.blocking_provider})` : ''}
          </p>
        )}
      </header>

      <div className="md:grid md:grid-cols-[168px_minmax(0,1fr)] md:gap-10">
        <StudioSectionList
          active={item}
          className="mb-6 md:mb-0 md:sticky md:top-10 md:self-start"
        />
        <StudioShell item={item} />
      </div>
    </PageShell>
  );
}
