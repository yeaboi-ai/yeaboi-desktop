// Does this build offer the Solo world? The Python sidecar owns the answer
// ($YEABOI_SOLO); main asks once per handshake and fans the result out to the
// menu bar and every window. Main asks, not the renderer, because main already
// owns the audience and the menu that has to lose its World submenu — a
// renderer-first fetch would race the menu it is meant to steer.
//
// Deliberately not cached in settings.json: a cached `true` from a build that
// had the world on is exactly the stale answer that would leak it back.

import { callApi } from './api-proxy';
import { soloEnabled } from '../shared/audience';
import type { Sidecar } from './sidecar';

type Listener = (enabled: boolean) => void;

export class SoloWorld {
  /** null until the sidecar has answered — "not yet", which the router tells
   *  apart from "no" so a cold deep link is held rather than redirected. */
  private state: boolean | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly sidecar: Sidecar) {
    this.sidecar.onState((backend) => {
      if (backend.kind === 'ready') void this.refresh();
      else if (backend.kind === 'down') this.set(false);
    });
  }

  get current(): boolean | null {
    return this.state;
  }

  onChange(listener: Listener): void {
    this.listeners.add(listener);
  }

  private async refresh(): Promise<void> {
    const result = await callApi(this.sidecar, '/api/meta/capabilities');
    // Any answer that is not an explicit true — an older sidecar, a 502, a
    // string "true" — means hidden. The default can only fail closed.
    this.set(result.status === 200 && soloEnabled(result.body as { solo_enabled?: unknown }));
  }

  private set(enabled: boolean): void {
    if (this.state === enabled) return;
    this.state = enabled;
    for (const listener of this.listeners) listener(enabled);
  }
}
