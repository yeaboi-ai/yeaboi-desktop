'use client';

// Internet radio for the window: one <audio> element, the analyser behind the
// spectrum, and the reducer that says what state the two are in.
//
// Ported from yeaboi-frontend's useMusic. The <audio> is owned by a ref rather
// than created at module scope: a module-level `new Audio()` runs on import,
// which under StrictMode's double mount leaves a second detached element
// playing the same station on top of the first.
//
// The analyser graph is built AFTER playback has started, and only once the
// context is actually running. That order is the whole safety of it: an
// element routed through a graph reaches the speakers only via that graph, and
// createMediaElementSource may be called once per element and never undone —
// so a context that turns out to be suspended captures the audio permanently
// and the window plays silence with every other sign of playing.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { MusicChannel } from '@/lib/yeaboi/ambience';
import { onMusicHoldChange } from '@/lib/music/hold';
import {
  MUSIC_INITIAL,
  NEEDS_A_CLICK,
  STREAM_UNAVAILABLE,
  musicReducer,
  type MusicState,
} from '@/lib/music/state';

export interface RadioApi {
  state: MusicState;
  analyser: AnalyserNode | null;
  /** When the current stretch of playing began, for the clock. */
  startedAt: number | null;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  toggle(): void;
  setChannel(index: number): void;
  next(): void;
  previous(): void;
  setVolume(value: number): void;
  /** Apply a stored preference. Never starts sound. */
  hydrate(patch: { channel?: number; volume?: number }): void;
}

export function useRadio(channels: readonly MusicChannel[]): RadioApi {
  const [state, dispatch] = useReducer(musicReducer, MUSIC_INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Create once, tear down on unmount. Clearing `src` is not optional: a
  // dropped <audio> keeps the stream socket open until GC gets to it.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.crossOrigin = 'anonymous';
    audio.volume = stateRef.current.volume;
    audioRef.current = audio;

    const onPlaying = (): void => {
      dispatch({ type: 'media', event: 'playing' });
      setStartedAt((current) => current ?? Date.now());
    };
    const onPause = (): void => dispatch({ type: 'media', event: 'pause' });
    const onError = (): void => {
      dispatch({ type: 'media', event: 'error', message: STREAM_UNAVAILABLE });
      setStartedAt(null);
    };
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  const urlFor = useCallback((index: number): string => {
    const list = channelsRef.current;
    if (!list.length) return '';
    const wrapped = ((index % list.length) + list.length) % list.length;
    return list[wrapped]?.url ?? '';
  }, []);

  /** Wire the analyser in once audio is running. Never at the cost of sound. */
  const connect = useCallback(async (audio: HTMLAudioElement): Promise<void> => {
    if (sourceRef.current) {
      void ctxRef.current?.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new Ctor();
      await ctx.resume();
      if (ctx.state !== 'running') throw new Error('audio context did not start');
      const source = ctx.createMediaElementSource(audio);
      const node = ctx.createAnalyser();
      // 1024 bins, so the visualiser's log-frequency bands have resolution
      // down at 40 Hz; the engine owns the smoothing, so the node's is light.
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.35;
      source.connect(node);
      node.connect(ctx.destination);
      ctxRef.current = ctx;
      sourceRef.current = source;
      setAnalyser(node);
    } catch {
      void ctx?.close();
      ctxRef.current = null;
      sourceRef.current = null;
      setAnalyser(null);
    }
  }, []);

  const start = useCallback(
    async (index: number): Promise<void> => {
      const audio = audioRef.current;
      if (!audio) return;
      const url = urlFor(index);
      if (!url) {
        dispatch({ type: 'media', event: 'error', message: 'no station to play' });
        return;
      }
      if (audio.src !== url) audio.src = url;
      dispatch({ type: 'play' });
      try {
        await audio.play();
      } catch (error) {
        const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
        dispatch({
          type: 'media',
          event: 'error',
          message: blocked ? NEEDS_A_CLICK : STREAM_UNAVAILABLE,
        });
        return;
      }
      void connect(audio);
    },
    [urlFor, connect],
  );

  const play = useCallback(() => start(stateRef.current.channel), [start]);

  const pause = useCallback((): void => {
    dispatch({ type: 'pause' });
    audioRef.current?.pause();
  }, []);

  const stop = useCallback((): void => {
    dispatch({ type: 'stop' });
    setStartedAt(null);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  const setChannel = useCallback(
    (index: number): void => {
      const count = channelsRef.current.length;
      const live =
        stateRef.current.status === 'playing' || stateRef.current.status === 'connecting';
      dispatch({ type: 'channel', index, count });
      const wrapped = count ? ((index % count) + count) % count : 0;
      if (live) {
        setStartedAt(null);
        void start(wrapped);
      }
    },
    [start],
  );

  const next = useCallback(() => setChannel(stateRef.current.channel + 1), [setChannel]);
  const previous = useCallback(() => setChannel(stateRef.current.channel - 1), [setChannel]);

  const setVolume = useCallback((value: number): void => {
    dispatch({ type: 'volume', value });
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, value));
  }, []);

  const hydrate = useCallback((patch: { channel?: number; volume?: number }): void => {
    dispatch({ type: 'hydrate', ...patch, count: channelsRef.current.length });
    if (typeof patch.volume === 'number' && audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, patch.volume));
    }
  }, []);

  const toggle = useCallback((): void => {
    const { status } = stateRef.current;
    if (status === 'playing' || status === 'connecting') pause();
    else void play();
  }, [pause, play]);

  // A hold pauses only a live radio and resumes only what it paused.
  useEffect(
    () =>
      onMusicHoldChange((held) => {
        const current = stateRef.current;
        if (held && (current.status === 'playing' || current.status === 'connecting')) {
          dispatch({ type: 'hold', held: true });
          audioRef.current?.pause();
        } else if (!held && current.held) {
          dispatch({ type: 'hold', held: false });
          void start(current.channel);
        }
      }),
    [start],
  );

  // The OS transport: media keys and the Now Playing widget.
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const name = channels[state.channel]?.name ?? 'Radio';
    try {
      session.metadata = new MediaMetadata({ title: name, artist: 'yeaboi radio' });
      session.playbackState =
        state.status === 'playing' || state.status === 'connecting' ? 'playing' : 'paused';
    } catch {
      /* an older Chromium without MediaMetadata costs the widget, nothing more */
    }
  }, [channels, state.channel, state.status]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const bind = (action: MediaSessionAction, handler: () => void) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* unsupported action */
      }
    };
    bind('play', () => void play());
    bind('pause', pause);
    bind('nexttrack', next);
    bind('previoustrack', previous);
    return () => {
      for (const action of ['play', 'pause', 'nexttrack', 'previoustrack'] as const) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* unsupported action */
        }
      }
    };
  }, [play, pause, next, previous]);

  useEffect(() => {
    if (state.status !== 'playing' && state.status !== 'paused' && state.status !== 'connecting') {
      setStartedAt(null);
    }
  }, [state.status]);

  return useMemo<RadioApi>(
    () => ({
      state,
      analyser,
      startedAt,
      play,
      pause,
      stop,
      toggle,
      setChannel,
      next,
      previous,
      setVolume,
      hydrate,
    }),
    [
      state,
      analyser,
      startedAt,
      play,
      pause,
      stop,
      toggle,
      setChannel,
      next,
      previous,
      setVolume,
      hydrate,
    ],
  );
}
