// What the vendor's embedded player says, and what it can be told.
//
// The players speak postMessage. YouTube's talks once it is asked to
// ("listening"), as JSON strings; Spotify's talks on its own, as objects.
// Apple's says nothing at all. This turns both dialects into one playback
// record and builds the commands going the other way; it never touches a
// window, so every rule is testable with plain objects.

import type { MusicLink, MusicService } from '@shared/music-links';

export type EmbedStatus = 'unknown' | 'playing' | 'paused' | 'buffering' | 'ended';

export interface EmbedPlayback {
  status: EmbedStatus;
  /** Seconds. */
  position: number;
  /** Seconds; 0 until the player says. */
  duration: number;
  title: string;
  artist: string;
  /** The player has spoken. Until then nothing here is known, only shown. */
  ready: boolean;
  /** Clock at the last word from the player, so a position can be extrapolated. */
  asOf: number;
  /** Paused by a hold rather than a person, so the hold's end may resume it. */
  heldBy: 'none' | 'hold';
}

export const EMBED_INITIAL: EmbedPlayback = {
  status: 'unknown',
  position: 0,
  duration: 0,
  title: '',
  artist: '',
  ready: false,
  asOf: 0,
  heldBy: 'none',
};

export type EmbedEvent =
  | { kind: 'ready' }
  | {
      kind: 'playback';
      patch: Partial<Pick<EmbedPlayback, 'status' | 'position' | 'duration' | 'title' | 'artist'>>;
    };

export type EmbedCommand = 'play' | 'pause' | 'toggle' | { seek: number };

export interface OutgoingMessage {
  targetOrigin: string;
  /** A string for YouTube, an object for Spotify: each player's own dialect. */
  data: string | Record<string, unknown>;
}

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const SPOTIFY_ORIGIN = 'https://open.spotify.com';
const YOUTUBE_ID = 1;

/** Where the player's messages come from; null for a player with no channel. */
export function bridgeOrigin(service: MusicService): string | null {
  if (service === 'youtube_music') return YOUTUBE_ORIGIN;
  if (service === 'spotify') return SPOTIFY_ORIGIN;
  return null;
}

export function hasChannel(service: MusicService): boolean {
  return bridgeOrigin(service) !== null;
}

/** The embed URL the frame loads. YouTube's player only speaks to a parent it
 *  was told about, so its URL names ours; the others are the grammar's own. */
export function bridgedEmbedUrl(link: MusicLink, origin: string): string {
  if (link.service !== 'youtube_music') return link.embedUrl;
  const url = new URL(link.embedUrl);
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('origin', origin);
  return url.toString();
}

/** YouTube's player states. Unstarted (-1) and cued (5) are a player waiting
 *  to be told to play: nothing sounds, so they read as paused. */
const YOUTUBE_STATES: Record<number, EmbedStatus> = {
  [-1]: 'paused',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'paused',
};

function youtubeInfo(info: unknown): EmbedEvent | null {
  if (!info || typeof info !== 'object') return null;
  const data = info as Record<string, unknown>;
  const patch: Extract<EmbedEvent, { kind: 'playback' }>['patch'] = {};
  if (typeof data['currentTime'] === 'number') patch.position = data['currentTime'];
  if (typeof data['duration'] === 'number') patch.duration = data['duration'];
  if (typeof data['playerState'] === 'number') {
    const status = YOUTUBE_STATES[data['playerState']];
    if (status) patch.status = status;
  }
  const video = data['videoData'];
  if (video && typeof video === 'object') {
    const meta = video as Record<string, unknown>;
    if (typeof meta['title'] === 'string') patch.title = meta['title'];
    if (typeof meta['author'] === 'string') patch.artist = meta['author'];
  }
  return Object.keys(patch).length ? { kind: 'playback', patch } : null;
}

function youtubeMessage(data: unknown): EmbedEvent | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const message = parsed as Record<string, unknown>;
  switch (message['event']) {
    case 'onReady':
      return { kind: 'ready' };
    case 'initialDelivery':
    case 'infoDelivery':
      return youtubeInfo(message['info']);
    case 'onStateChange': {
      const status =
        typeof message['info'] === 'number' ? YOUTUBE_STATES[message['info']] : undefined;
      return status ? { kind: 'playback', patch: { status } } : null;
    }
    default:
      return null;
  }
}

function spotifyMessage(data: unknown): EmbedEvent | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  const payload = (
    message['payload'] && typeof message['payload'] === 'object' ? message['payload'] : {}
  ) as Record<string, unknown>;
  switch (message['type']) {
    case 'ready':
      return { kind: 'ready' };
    case 'playback_started':
      return { kind: 'playback', patch: { status: 'playing' } };
    case 'playback_update': {
      const patch: Extract<EmbedEvent, { kind: 'playback' }>['patch'] = {};
      // Spotify counts in milliseconds.
      if (typeof payload['position'] === 'number') patch.position = payload['position'] / 1000;
      if (typeof payload['duration'] === 'number') patch.duration = payload['duration'] / 1000;
      if (payload['isBuffering'] === true) patch.status = 'buffering';
      else if (typeof payload['isPaused'] === 'boolean')
        patch.status = payload['isPaused'] ? 'paused' : 'playing';
      return { kind: 'playback', patch };
    }
    default:
      return null;
  }
}

/** One message from a frame, or null: the wrong origin, or noise. */
export function parseEmbedMessage(
  service: MusicService,
  origin: string,
  data: unknown,
): EmbedEvent | null {
  if (origin !== bridgeOrigin(service)) return null;
  return service === 'youtube_music' ? youtubeMessage(data) : spotifyMessage(data);
}

export function embedReducer(state: EmbedPlayback, event: EmbedEvent, now: number): EmbedPlayback {
  if (event.kind === 'ready') return { ...state, ready: true, asOf: now };
  const next = { ...state, ...event.patch, ready: true, asOf: now };
  // A person pressing play in the player ends the hold's claim on it.
  if (next.status === 'playing') next.heldBy = 'none';
  return next;
}

/** YouTube's player says nothing until asked; posted after the frame loads. */
export function listeningMessage(service: MusicService): OutgoingMessage | null {
  if (service !== 'youtube_music') return null;
  return {
    targetOrigin: YOUTUBE_ORIGIN,
    data: JSON.stringify({ event: 'listening', id: YOUTUBE_ID, channel: 'widget' }),
  };
}

/** The widget only hears a command on its own channel, as its API sends it. */
function youtubeCommand(func: string, args: unknown[] = []): OutgoingMessage {
  return {
    targetOrigin: YOUTUBE_ORIGIN,
    data: JSON.stringify({ event: 'command', func, args, id: YOUTUBE_ID, channel: 'widget' }),
  };
}

/** The message that carries a command to the player, or null when the player
 *  takes none (Apple). A toggle is resolved here from the last known status. */
export function embedCommand(
  service: MusicService,
  command: EmbedCommand,
  state: EmbedPlayback,
): OutgoingMessage | null {
  const playing = state.status === 'playing' || state.status === 'buffering';
  if (service === 'youtube_music') {
    if (typeof command === 'object')
      return youtubeCommand('seekTo', [Math.max(0, command.seek), true]);
    if (command === 'play') return youtubeCommand('playVideo');
    if (command === 'pause') return youtubeCommand('pauseVideo');
    return youtubeCommand(playing ? 'pauseVideo' : 'playVideo');
  }
  if (service === 'spotify') {
    if (typeof command === 'object')
      return {
        targetOrigin: SPOTIFY_ORIGIN,
        data: { command: 'seek', timestamp: Math.max(0, command.seek) },
      };
    if (command === 'toggle')
      return { targetOrigin: SPOTIFY_ORIGIN, data: { command: playing ? 'pause' : 'play' } };
    return { targetOrigin: SPOTIFY_ORIGIN, data: { command } };
  }
  return null;
}

/** Where the player is now, from its last word and the clock since. */
export function embedPositionAt(state: EmbedPlayback, now: number): number {
  if (state.status !== 'playing' || !state.asOf) return state.position;
  const elapsed = Math.max(0, (now - state.asOf) / 1000);
  const position = state.position + elapsed;
  return state.duration > 0 ? Math.min(state.duration, position) : position;
}
