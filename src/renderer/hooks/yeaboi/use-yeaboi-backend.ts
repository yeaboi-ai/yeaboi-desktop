// The yeaboi app sidecar's state, as a hook. Pull once on mount (the backend
// may have become ready before this window subscribed), then follow the push
// half. Pages render a "backend starting" skeleton off this instead of each
// inventing their own probe.

import { useEffect, useState } from 'react';
import { getBackendState, onBackendState } from '@/lib/yeaboi/api';

export interface YeaboiBackendState {
  kind: 'starting' | 'ready' | 'down';
  reason?: string;
}

export function useYeaboiBackend(): YeaboiBackendState {
  const [state, setState] = useState<YeaboiBackendState>({ kind: 'starting' });

  useEffect(() => {
    let mounted = true;
    void getBackendState().then((current) => {
      if (mounted) setState(current as YeaboiBackendState);
    });
    onBackendState((next) => {
      if (mounted) setState(next as YeaboiBackendState);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
