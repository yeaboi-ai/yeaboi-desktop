// What the palette searches besides the route registry, fetched the first
// time it opens and again, quietly, on every later open. Each read keeps its
// last good answer: an older sidecar answers 404 (null), a platform that is
// not signed in is not asked, and neither empties a list that was there.

import { useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { loadCapabilities, type Capabilities } from '@/lib/yeaboi/capabilities';
import type { PaletteSession } from '@/lib/yeaboi/palette';
import { loadRecentSessions, type RecentSession } from '@/lib/yeaboi/sessions';
import { loadSettings, type SettingField } from '@/lib/yeaboi/settings';

const RECENT_LIMIT = 40;

export interface PaletteSources {
  caps: Capabilities | null;
  projects: PaletteSession[] | null;
  sessions: RecentSession[] | null;
  settings: SettingField[] | null;
}

export function usePaletteSources(active: boolean): PaletteSources {
  const backend = useYeaboiBackend();
  const { authFetch, ready } = useAuthFetch();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [projects, setProjects] = useState<PaletteSession[] | null>(null);
  const [sessions, setSessions] = useState<RecentSession[] | null>(null);
  const [settings, setSettings] = useState<SettingField[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    if (backend.kind === 'ready') {
      loadCapabilities().then(
        (next) => !stale && setCaps(next),
        () => undefined,
      );
      loadRecentSessions({ limit: RECENT_LIMIT }).then(
        (rows) => !stale && rows && setSessions(rows),
        () => undefined,
      );
      loadSettings().then(
        (snapshot) => !stale && setSettings(snapshot.fields),
        () => undefined,
      );
    }
    if (ready) {
      authFetch('/api/sessions')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { id: string; name: string }[] | null) => {
          if (stale || !Array.isArray(data)) return;
          setProjects(data.map((row) => ({ id: row.id, name: row.name })));
        })
        .catch(() => undefined);
    }
    return () => {
      stale = true;
    };
  }, [active, backend.kind, ready, authFetch]);

  return { caps, projects, sessions, settings };
}
