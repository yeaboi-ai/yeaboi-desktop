'use client';

// Every mode a run can be, each opening on its own start page. A run is its
// own thing now — it does not happen inside a session and carries nothing
// from one — so this is a list of ways in, not a list of what has happened.

import { useEffect, useState } from 'react';
import { useAudience } from '@/components/providers/audience-provider';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { ModeList } from '@/components/yeaboi/mode-list';
import { loadCapabilities, runModesFor, type Capabilities } from '@/lib/yeaboi/capabilities';
import { startRouteFor } from '@/lib/yeaboi/tips';

function Body() {
  const { audience } = useAudience();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCapabilities().then(setCaps, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The mode inventory could not be read: {error}
      </p>
    );
  }
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <section aria-labelledby="start-a-run">
      <h2 id="start-a-run" className="mb-1 text-[16px] font-body font-medium text-foreground">
        Start a run
      </h2>
      <p className="mb-3 text-[13px] text-muted-foreground">
        Runs keep their own history, under Runs.
      </p>
      <ModeList cards={runModesFor(caps, audience)} hrefFor={(key) => startRouteFor(key)} />
    </section>
  );
}

export function RunLinksPanel() {
  return (
    <BackendGate>
      <Body />
    </BackendGate>
  );
}
