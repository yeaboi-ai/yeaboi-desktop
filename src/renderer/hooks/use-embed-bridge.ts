'use client';

// The window's side of the embed's channel: one message listener bound to the
// frame, the commands posted back, and the hold that pauses only what it
// paused. Every rule lives in lib/music/embed/bridge.ts; this only wires it.

import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react';
import type { MusicLink } from '@shared/music-links';
import {
  EMBED_INITIAL,
  embedCommand,
  embedReducer,
  hasChannel,
  listeningMessage,
  parseEmbedMessage,
  type EmbedCommand,
  type EmbedEvent,
  type EmbedPlayback,
  type OutgoingMessage,
} from '@/lib/music/embed/bridge';
import { onMusicHoldChange } from '@/lib/music/hold';

/** YouTube's player is asked to talk this often, for this long, until it does. */
const LISTEN_EVERY_MS = 500;
const LISTEN_FOR_MS = 10_000;

export interface EmbedBridgeApi {
  /** The player's last word, or null while no embed is up. */
  playback: EmbedPlayback | null;
  /** True when the player was told; false when it takes no commands. */
  send(command: EmbedCommand): boolean;
  /** For the frame's load event: opens the channel. */
  onLoad(): void;
}

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: EmbedEvent; now: number }
  | { type: 'held'; heldBy: EmbedPlayback['heldBy'] };

function reducer(state: EmbedPlayback, action: Action): EmbedPlayback {
  switch (action.type) {
    case 'reset':
      return EMBED_INITIAL;
    case 'event':
      return embedReducer(state, action.event, action.now);
    case 'held':
      return { ...state, heldBy: action.heldBy };
  }
}

export function useEmbedBridge(
  frameRef: RefObject<HTMLIFrameElement | null>,
  link: MusicLink | null,
): EmbedBridgeApi {
  const [playback, dispatch] = useReducer(reducer, EMBED_INITIAL);
  const linkRef = useRef(link);
  linkRef.current = link;
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const embedUrl = link?.embedUrl ?? '';
  const service = link?.service ?? null;

  // A new link is a new player; the old one's words mean nothing for it.
  useEffect(() => dispatch({ type: 'reset' }), [embedUrl]);

  const post = useCallback(
    (message: OutgoingMessage | null): boolean => {
      const target = frameRef.current?.contentWindow;
      if (!message || !target) return false;
      target.postMessage(message.data, message.targetOrigin);
      return true;
    },
    [frameRef],
  );

  useEffect(() => {
    if (!service) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const parsed = parseEmbedMessage(service, event.origin, event.data);
      if (parsed) dispatch({ type: 'event', event: parsed, now: Date.now() });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [service, frameRef]);

  const listening = useRef<number | null>(null);
  const stopListening = useCallback(() => {
    if (listening.current !== null) {
      window.clearInterval(listening.current);
      listening.current = null;
    }
  }, []);
  const onLoad = useCallback(() => {
    stopListening();
    const current = linkRef.current;
    const message = current ? listeningMessage(current.service) : null;
    if (!message) return;
    const started = Date.now();
    post(message);
    listening.current = window.setInterval(() => {
      if (playbackRef.current.ready || Date.now() - started > LISTEN_FOR_MS) stopListening();
      else post(message);
    }, LISTEN_EVERY_MS);
  }, [post, stopListening]);
  useEffect(() => stopListening, [stopListening]);

  const send = useCallback(
    (command: EmbedCommand): boolean => {
      const current = linkRef.current;
      if (!current) return false;
      return post(embedCommand(current.service, command, playbackRef.current));
    },
    [post],
  );

  // A hold pauses a playing embed and resumes only what it paused. A frame
  // with no channel is the provider's problem: it stops it outright.
  useEffect(
    () =>
      onMusicHoldChange((held) => {
        const current = linkRef.current;
        if (!current || !hasChannel(current.service)) return;
        const state = playbackRef.current;
        const sounding = state.status === 'playing' || state.status === 'buffering';
        if (held && sounding) {
          if (post(embedCommand(current.service, 'pause', state)))
            dispatch({ type: 'held', heldBy: 'hold' });
        } else if (!held && state.heldBy === 'hold') {
          post(embedCommand(current.service, 'play', state));
          dispatch({ type: 'held', heldBy: 'none' });
        }
      }),
    [post],
  );

  return { playback: link ? playback : null, send, onLoad };
}
