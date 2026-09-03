'use client';

// Home — the active world's diptych: Projects or Sessions. Solo alone puts its
// Today strip above the choice, because for one person "where am I" comes
// before "what do I want to do".

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useAudience } from '@/components/providers/audience-provider';
import { TodayStrip } from '@/components/yeaboi/today-strip';
import { HomeDiptych } from './home/home-diptych';

export default function HomePage() {
  const { audience } = useAudience();
  return (
    <BackendGate>
      {/* Niko's pill floats over the bottom of the window; the padding keeps
          the last row reachable under it. */}
      <div className="mx-auto max-w-5xl px-6 py-14 pb-40">
        {audience === 'solo' && <TodayStrip />}
        <HomeDiptych />
      </div>
    </BackendGate>
  );
}
