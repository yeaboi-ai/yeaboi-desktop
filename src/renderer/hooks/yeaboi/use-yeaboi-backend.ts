// The yeaboi app sidecar's state, as a hook. Pages render a "backend starting"
// skeleton off this instead of each inventing their own probe.
//
// The state is the app's, not a component's. Every mount used to start at
// `starting` and learn otherwise an IPC round trip later, so every page turn
// onto a gated surface flashed the starting skeleton — the backend having been
// up for minutes. It is read once, kept here, and handed to whatever mounts
// next; a later mount starts from what is already known and renders nothing it
// has to take back.
//
// The subscription is once for the same reason plus one of its own: the bridge
// takes listeners and never gives them back, so subscribing per mount leaks one
// per page turn.

import { useEffect, useState } from 'react';
import { getBackendState, onBackendState } from '@/lib/yeaboi/api';

export interface YeaboiBackendState {
  kind: 'starting' | 'ready' | 'down';
  reason?: string;
}

let known: YeaboiBackendState = { kind: 'starting' };
const readers = new Set<(state: YeaboiBackendState) => void>();
let listening = false;

function publish(next: YeaboiBackendState): void {
  known = next;
  for (const reader of readers) reader(next);
}

export function useYeaboiBackend(): YeaboiBackendState {
  const [state, setState] = useState<YeaboiBackendState>(known);

  useEffect(() => {
    readers.add(setState);
    if (!listening) {
      listening = true;
      onBackendState((next) => publish(next as YeaboiBackendState));
    }
    // Still asked on every mount: the answer is cheap, and a window that has
    // been sitting on a stale `down` should correct itself on the next page.
    void getBackendState().then((current) => publish(current as YeaboiBackendState));
    return () => {
      readers.delete(setState);
    };
  }, []);

  return state;
}
