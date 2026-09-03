'use client';

// The project page's two columns from the yeaboi engine: the modes a run can
// be, each opening inside this project, and the runs already inside it. The
// engine project is minted only when a run starts, so a project that has
// never run anything has no engine id and says so.

import { useEffect, useState } from 'react';
import { useAudience } from '@/components/providers/audience-provider';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { ModeList } from '@/components/yeaboi/mode-list';
import {
  allCards,
  loadCapabilities,
  runModesFor,
  type Capabilities,
} from '@/lib/yeaboi/capabilities';
import { sessionRows } from '@/lib/yeaboi/glimpse';
import { runInsideHref } from '@/lib/yeaboi/project-scope';
import {
  loadEngineProjectSessions,
  shapeSessions,
  type RecentSession,
} from '@/lib/yeaboi/sessions';
import { startRouteFor } from '@/lib/yeaboi/tips';

const SESSIONS_LIMIT = 8;

export interface RunInsideProject {
  id: string;
  name: string;
  yeaboi_project_id?: string | null;
}

function Body({ project }: { project: RunInsideProject }) {
  const { audience } = useAudience();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  // undefined until the fetch settles, so the empty sentence never flashes first.
  const [sessions, setSessions] = useState<RecentSession[] | null | 'error' | undefined>();
  const engineId = project.yeaboi_project_id ?? '';

  useEffect(() => {
    loadCapabilities().then(setCaps, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!engineId) return;
    loadEngineProjectSessions(engineId, { limit: SESSIONS_LIMIT }).then(setSessions, () =>
      setSessions('error'),
    );
  }, [engineId]);

  if (error) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The mode inventory could not be read: {error}
      </p>
    );
  }
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const rows = Array.isArray(sessions)
    ? sessionRows(shapeSessions(sessions, allCards(caps), new Date()))
    : [];
  const settled = !engineId || sessions !== undefined;
  const empty = !engineId
    ? 'Nothing has run inside this project yet.'
    : sessions === null
      ? 'This sidecar does not list a project’s runs yet.'
      : sessions === 'error'
        ? 'The runs inside this project could not be read.'
        : 'Nothing has run inside this project yet.';

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
      <section aria-labelledby="run-inside">
        <h2 id="run-inside" className="mb-1 text-[16px] font-body font-medium text-foreground">
          Run inside this project
        </h2>
        <ModeList
          cards={runModesFor(caps, audience)}
          hrefFor={(key) => {
            const route = startRouteFor(key);
            return route ? runInsideHref(key, route, project.id) : null;
          }}
        />
      </section>
      <section aria-labelledby="sessions-inside">
        <h2 id="sessions-inside" className="mb-3 text-[16px] font-body font-medium text-foreground">
          Sessions in this project
        </h2>
        {settled && <GlimpseList rows={rows} empty={empty} />}
      </section>
    </div>
  );
}

export function RunInsidePanel({ project }: { project: RunInsideProject }) {
  return (
    <BackendGate>
      <Body project={project} />
    </BackendGate>
  );
}
