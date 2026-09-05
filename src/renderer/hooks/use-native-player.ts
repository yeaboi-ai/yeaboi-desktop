'use client';

// What Spotify or Music is playing, polled through main while the Music page
// or the pocket cares. Main never polls on its own, and a closed app is never
// opened by a poll (see src/main/music-native.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeApp, NativeCommand, NativeNowPlaying } from '@shared/music-native';

const POLL_MS = 3_000;
const AFTER_COMMAND_MS = 400;

export interface NativePlayerApi {
  nowPlaying: NativeNowPlaying | null;
  /** True once the app has reported a track this session, so the pocket can
   *  keep showing it between polls. */
  send(command: NativeCommand): Promise<void>;
  refresh(): Promise<void>;
}

export function useNativePlayer(app: NativeApp | null, active: boolean): NativePlayerApi {
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
    if (!app || !active) {
      setNowPlaying(null);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [app, active, refresh]);

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
