// The context scope a run page holds: the options read once per mode, the
// scope the picker edits, and the run-body keys. A sidecar older than the
// context routes answers 404, and then the page runs exactly as it did before —
// no picker, no keys.

import { useCallback, useEffect, useState } from 'react';
import { defaultScope, runBody, type ContextOptions, type ContextScope } from '@/lib/context/scope';
import { loadContextOptions } from '@/lib/yeaboi/context';

export interface ContextScopeState {
  /** null until read, or when the sidecar has no context routes. */
  options: ContextOptions | null;
  scope: ContextScope;
  setScope: (next: ContextScope) => void;
  /** True once the options arrived; the picker draws and the body carries the keys. */
  available: boolean;
  body: () => Record<string, unknown>;
}

export function useContextScope(mode: string): ContextScopeState {
  const [options, setOptions] = useState<ContextOptions | null>(null);
  const [scope, setScope] = useState<ContextScope>(() => defaultScope(null));

  useEffect(() => {
    let live = true;
    loadContextOptions(mode).then(
      (loaded) => {
        if (!live) return;
        setOptions(loaded);
        if (loaded) setScope(defaultScope(loaded));
      },
      // An unreadable options route is the same page as an older sidecar.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [mode]);

  const available = options !== null;
  const body = useCallback(() => runBody(scope, available), [scope, available]);

  return { options, scope, setScope, available, body };
}
