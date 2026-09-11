// What the palette searches besides the route registry, fetched the first
// time it opens and again, quietly, on every later open. Each read keeps its
// last good answer: an older sidecar answers 404 (null) and never empties a
// list that was there.

import { useEffect, useState } from 'react';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { loadCapabilities, type Capabilities } from '@/lib/yeaboi/capabilities';
import { listChats } from '@/lib/yeaboi/chat';
import type { PalettePlan } from '@/lib/yeaboi/palette';
import { loadRecentSessions, type RecentSession } from '@/lib/yeaboi/sessions';
import { loadSettings, type SettingField } from '@/lib/yeaboi/settings';

const RECENT_LIMIT = 40;

export interface PaletteSources {
  caps: Capabilities | null;
  plans: PalettePlan[] | null;
  sessions: RecentSession[] | null;
  settings: SettingField[] | null;
}

export function usePaletteSources(active: boolean): PaletteSources {
  const backend = useYeaboiBackend();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [plans, setPlans] = useState<PalettePlan[] | null>(null);
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
      listChats({ limit: RECENT_LIMIT }).then(
        (rows) =>
          !stale &&
          setPlans(rows.map((row) => ({ id: row.session_id, name: row.title || 'Untitled plan' }))),
        () => undefined,
      );
    }
    return () => {
      stale = true;
    };
  }, [active, backend.kind]);

  return { caps, plans, sessions, settings };
}
