// The radio's state machine, as a reducer the hook and the tests share.
//
// The terminal's rules, kept: nothing plays until a person asks; a hold (a
// call, a voice session) pauses only what it pauses and resumes only that; a
// dead stream is a named failure with a way back, not a button stuck mid-buffer.

export type PlaybackStatus = 'stopped' | 'connecting' | 'playing' | 'paused' | 'failed';

export interface MusicState {
  status: PlaybackStatus;
  channel: number;
  /** 0..1 */
  volume: number;
  /** Paused by a hold rather than a person, so the hold's end may resume it. */
  held: boolean;
  error: string;
}

export type MusicAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'media'; event: 'playing' | 'pause' | 'error'; message?: string }
  | { type: 'channel'; index: number; count: number }
  | { type: 'next'; count: number }
  | { type: 'previous'; count: number }
  | { type: 'volume'; value: number }
  | { type: 'hold'; held: boolean }
  | { type: 'hydrate'; channel?: number; volume?: number; count: number };

/** The terminal's own words for the same moment. */
export const STREAM_UNAVAILABLE = 'stream unavailable, press play to retry';
export const NEEDS_A_CLICK = 'press play once to start';

export const STATUS_WORDS: Record<PlaybackStatus, string> = {
  stopped: 'off',
  connecting: 'connecting…',
  playing: 'playing',
  paused: 'paused',
  failed: STREAM_UNAVAILABLE,
};

export const MUSIC_INITIAL: MusicState = {
  status: 'stopped',
  channel: 0,
  volume: 0.35,
  held: false,
  error: '',
};

function wrap(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

const LIVE = new Set<PlaybackStatus>(['playing', 'connecting']);

function retuned(state: MusicState): MusicState {
  return { ...state, status: state.status === 'failed' ? 'stopped' : state.status, error: '' };
}

export function musicReducer(state: MusicState, action: MusicAction): MusicState {
  switch (action.type) {
    case 'play':
      return { ...state, status: 'connecting', held: false, error: '' };
    case 'pause':
      return LIVE.has(state.status) ? { ...state, status: 'paused', held: false } : state;
    case 'stop':
      return { ...state, status: 'stopped', held: false, error: '' };
    case 'media':
      if (action.event === 'playing') return { ...state, status: 'playing', error: '' };
      if (action.event === 'error') {
        return {
          ...state,
          status: 'failed',
          held: false,
          error: action.message || STREAM_UNAVAILABLE,
        };
      }
      // A pause the element reports on its own: a person's pause is already
      // in the state, and a dead station's pause after its error stays failed.
      if (state.status === 'playing') return { ...state, status: 'paused' };
      if (state.status === 'connecting') return { ...state, status: 'stopped' };
      return state;
    // A new station is a fresh start: a failure belonged to the old one.
    case 'channel':
      return { ...retuned(state), channel: wrap(action.index, action.count) };
    case 'next':
      return { ...retuned(state), channel: wrap(state.channel + 1, action.count) };
    case 'previous':
      return { ...retuned(state), channel: wrap(state.channel - 1, action.count) };
    case 'volume':
      return { ...state, volume: Math.min(1, Math.max(0, action.value)) };
    case 'hold':
      if (action.held) {
        return LIVE.has(state.status) ? { ...state, status: 'paused', held: true } : state;
      }
      return state.held ? { ...state, status: 'connecting', held: false } : state;
    case 'hydrate': {
      // A preference is never a play: the app comes up quiet however it was left.
      const channel =
        typeof action.channel === 'number' && action.channel >= 0 && action.channel < action.count
          ? action.channel
          : state.channel;
      const volume =
        typeof action.volume === 'number' && Number.isFinite(action.volume)
          ? Math.min(1, Math.max(0, action.volume))
          : state.volume;
      return { ...state, channel, volume };
    }
    default:
      return state;
  }
}

/** What the rail pocket draws. A stopped radio yields to whatever else is
 *  sounding: an embed playing here in the window, then Spotify or Music. */
export type PocketMood =
  'off' | 'connecting' | 'live' | 'held' | 'paused' | 'failed' | 'native' | 'embed';

export interface PocketSources {
  /** Spotify or Music reports it is playing. */
  native: boolean;
  /** A vendor's embed is up in the window. */
  embed: boolean;
}

export function pocketMood(state: MusicState, sources: PocketSources): PocketMood {
  if (state.status === 'playing') return 'live';
  if (state.status === 'connecting') return 'connecting';
  if (sources.embed) return 'embed';
  if (sources.native) return 'native';
  if (state.status === 'failed') return 'failed';
  if (state.status === 'paused') return state.held ? 'held' : 'paused';
  return 'off';
}

/** "1:42:07" or "4:07" — the radio's clock, from seconds. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
