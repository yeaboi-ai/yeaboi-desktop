'use client';

// One page for every mode's hub, drawn from its descriptor (lib/yeaboi/hubs.ts):
// the rows it loads, the one thing to do, the other ways in.

import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { HubFrame, type HubRows } from '@/components/hub/hub-frame';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { PLANNING_HUB_LINKS } from '@/lib/nav/sections';
import { PLANNING_HUB, type HubDescriptor } from '@/lib/yeaboi/hubs';

function HubBody({ hub }: { hub: HubDescriptor }) {
  const [rows, setRows] = useState<HubRows>('loading');

  const load = useCallback(() => {
    hub.load().then(setRows, () => setRows('error'));
  }, [hub]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <HubFrame
      hub={hub}
      rows={rows}
      onRemoved={load}
      links={hub.key === 'project-planning' ? PLANNING_HUB_LINKS : []}
    />
  );
}

export default function ModeHubPage({ hub = PLANNING_HUB }: { hub?: HubDescriptor }) {
  return (
    <PageShell>
      <BackendGate>
        <HubBody hub={hub} />
      </BackendGate>
    </PageShell>
  );
}
