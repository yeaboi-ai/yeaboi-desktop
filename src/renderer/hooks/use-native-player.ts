'use client';

// What Spotify or Music is playing, polled through main at the cadence the
// caller asks for. Main never polls on its own, and a closed app is never
// opened by a poll (see src/main/music-native.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeApp, NativeCommand, NativeNowPlaying } from '@shared/music-native';

/** `fast` while the Music page shows the app; `slow` while only the pocket
 *  watches it from elsewhere; `off` when nobody is looking. */
export type NativeCadence = 'off' | 'slow' | 'fast';

const CADENCE_MS: Record<Exclude<NativeCadence, 'off'>, number> = { slow: 10_000, fast: 3_000 };
const AFTER_COMMAND_MS = 400;

export interface NativePlayerApi {
  nowPlaying: NativeNowPlaying | null;
  send(command: NativeCommand): Promise<void>;
  refresh(): Promise<void>;
}

export function useNativePlayer(app: NativeApp | null, cadence: NativeCadence): NativePlayerApi {
  const [nowPlaying, setNowPlaying] = useState<NativeNowPlaying | null>(null);
  const appRef = useRef(app);
  appRef.current = app;

  const refresh = useCallback(async () => {
    const current = appRef.current;
    if (!current) {
      setNowPlaying(null);
      return;
    }
    try {
      const state = (await window.yeaboi.musicNativeState(current)) as NativeNowPlaying | null;
      setNowPlaying(state && state.app === current ? state : null);
    } catch {
      setNowPlaying(null);
    }
  }, []);

  useEffect(() => {
    if (!app || cadence === 'off') {
      setNowPlaying(null);
      return;
    }
    void refresh();
    // A hidden window keeps its last answer rather than asking again.
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, CADENCE_MS[cadence]);
    return () => clearInterval(timer);
  }, [app, cadence, refresh]);

  const send = useCallback(
    async (command: NativeCommand) => {
      const current = appRef.current;
      if (!current) return;
      try {
        await window.yeaboi.musicNativeCommand(current, command);
      } catch {
        /* the app may have quit between polls; the next poll says so */
      }
      setTimeout(() => void refresh(), AFTER_COMMAND_MS);
    },
    [refresh],
  );

  return { nowPlaying, send, refresh };
}
