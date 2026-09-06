// The suggestions sheet as the Projects page sees it: asked once on mount,
// polled while the sidecar's refresh runs (within a budget), and asked again
// with a forced refresh when the reader presses Retry.

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  SUGGESTIONS_STALE_RETRY_MS,
  loadProjectSuggestions,
  shouldRetry,
  type SuggestionSheet,
} from '@/lib/yeaboi/suggestions';

export interface ProjectSuggestions {
  /** undefined until the sidecar answers, null on one without the route. */
  sheet: SuggestionSheet | null | undefined;
  /** The polling budget ran out while the sidecar was still refreshing. */
  exhausted: boolean;
  /** The request did not answer at all — a 500, a restarted sidecar, a dead
   *  bridge. Distinct from `sheet === null`, which is a 404 and means the
   *  sidecar is simply too old to have the route. */
  failed: boolean;
  /** A request is in flight or the refresh is still being polled. */
  refreshing: boolean;
  /** Ask for a recompute and poll again with a fresh budget. */
  retry: () => void;
}

export function useProjectSuggestions(): ProjectSuggestions {
  const [sheet, setSheet] = useState<SuggestionSheet | null | undefined>(undefined);
  const [exhausted, setExhausted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback((refresh: boolean) => {
    let attempts = 0;
    if (timer.current) clearTimeout(timer.current);
    setExhausted(false);
    setFailed(false);
    setRefreshing(true);
    const ask = (force: boolean) =>
      loadProjectSuggestions({ refresh: force }).then(
        (loaded) => {
          if (!alive.current) return;
          setSheet(loaded);
          if (shouldRetry(loaded, attempts++)) {
            timer.current = setTimeout(() => ask(false), SUGGESTIONS_STALE_RETRY_MS);
            return;
          }
          setRefreshing(false);
          setExhausted(Boolean(loaded && loaded.stale && loaded.refreshing));
        },
        (error) => {
          logger.warn('Failed to read project suggestions: %s', String(error));
          if (!alive.current) return;
          setSheet(null);
          setFailed(true);
          setRefreshing(false);
        },
      );
    void ask(refresh);
  }, []);

  useEffect(() => {
    alive.current = true;
    run(false);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [run]);

  const retry = useCallback(() => run(true), [run]);
  return { sheet, exhausted, failed, refreshing, retry };
}
