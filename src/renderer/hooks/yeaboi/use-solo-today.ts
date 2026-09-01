// The solo home's Today snapshot: read once on mount, re-read whenever the
// window comes back — a standup run in the terminal, or an agent session that
// ended while the app was in the background, should show without a reload.
//
// A failure is an empty strip, never an error: the strip is a companion to the
// home, and the home must not break because one of four readers did. A 404 is
// different — the sidecar predates the route — and hides the strip entirely.

import { useCallback, useEffect, useState } from 'react';
import { loadSoloToday, type SoloToday } from '@/lib/yeaboi/solo';

export interface SoloTodayState {
  today: SoloToday | null;
  /** False once the first read has settled either way. */
  loading: boolean;
  /** True when the sidecar has no such route — render nothing. */
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
