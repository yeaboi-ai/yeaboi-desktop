// The solo home's Today snapshot: read once on mount, re-read whenever the
// window comes back — a standup run in the terminal, or an agent session that
// ended while the app was in the background, should show without a reload.
//
// A failed read hides the strip, never breaks the home: the strip is a
// companion, and an empty tile would assert "no standup yet" about a week the
// app could not read. A 404 hides it the same way — the sidecar predates the
// route.

import { useCallback, useEffect, useState } from 'react';
import { loadSoloToday, type SoloToday } from '@/lib/yeaboi/solo';

export interface SoloTodayState {
  today: SoloToday | null;
  /** False once the first read has settled either way. */
  loading: boolean;
  /** True when the sidecar has no such route, or the read failed — render nothing. */
  unsupported: boolean;
  refresh: () => void;
}

export function useSoloToday(): SoloTodayState {
  const [today, setToday] = useState<SoloToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  const refresh = useCallback(() => {
    loadSoloToday().then(
      (snapshot) => {
        setUnsupported(snapshot === null);
        setToday(snapshot);
        setLoading(false);
      },
      () => {
        setUnsupported(true);
        setToday(null);
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { today, loading, unsupported, refresh };
}
