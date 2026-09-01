// A streamed yeaboi run as a hook: start() opens the NDJSON stream, every
// line folds through the wire module's pure reducer, cancel() posts the op
// cancel when the run announced one. One run at a time per hook instance —
// the contract's runs are request-scoped, and a page shows one at a time.

import { useCallback, useRef, useState } from 'react';
import { useScreensaverSuppression } from '@/hooks/use-screensaver-suppression';
import { apiStream } from '@/lib/yeaboi/api';
import { type ModeRunState, cancelModeRun, emptyModeRun, reduceModeRun } from '@/lib/yeaboi/modes';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

/** How a run ended: `done` only when no line reported an error. */
export type RunOutcome = 'done' | 'error';

export interface NdjsonRun {
  run: ModeRunState;
  status: RunStatus;
  /** Every raw line, for pages whose payloads carry more than the mode shape. */
  lines: unknown[];
  /** Resolves to the outcome — status is React state, so it is stale in the caller's closure. */
  start: (path: string, body: object) => Promise<RunOutcome>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useNdjsonRun(): NdjsonRun {
  const [run, setRun] = useState<ModeRunState>(emptyModeRun());
  const [status, setStatus] = useState<RunStatus>('idle');
  const [lines, setLines] = useState<unknown[]>([]);
  // The op id must be readable from cancel() mid-stream, before React commits.
  const opRef = useRef('');
  // A run is work, not idleness: the screensaver must not cover the stream the
  // person is watching, and the minutes it takes must not count toward idle.
  useScreensaverSuppression(status === 'running');

  const start = useCallback(async (path: string, body: object): Promise<RunOutcome> => {
    opRef.current = '';
    setRun(emptyModeRun());
    setLines([]);
    setStatus('running');
    // The reduced state, readable after the stream ends: an `error` line
    // resolves the stream cleanly, so the thrown path alone misses it.
    let latest = emptyModeRun();
    try {
      await apiStream(path, body, (line) => {
        setLines((all) => [...all, line]);
        latest = reduceModeRun(latest, line);
        setRun((state) => {
          const next = reduceModeRun(state, line);
          if (next.opId) opRef.current = next.opId;
          return next;
        });
      });
      setStatus('done');
      return latest.error || latest.cancelled ? 'error' : 'done';
    } catch (error) {
      setRun((state) =>
        state.finished ? state : { ...state, error: (error as Error).message, finished: true },
      );
      setStatus('error');
      return 'error';
    }
  }, []);

  const cancel = useCallback(async () => {
    // No op line means no cancel seam — the contract's own rule: a Cancel
    // button on a run that cannot stop would be a lie.
    if (!opRef.current) return;
    await cancelModeRun(opRef.current).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    opRef.current = '';
    setRun(emptyModeRun());
    setLines([]);
    setStatus('idle');
  }, []);

  return { run, status, lines, start, cancel, reset };
}
