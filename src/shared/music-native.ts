// The desktop music apps, driven as data: the AppleScript the main process
// hands to osascript, and the parser for what comes back.
//
// Pure — no Electron, no child_process — so every script is a string a test
// can read. Two rules the scripts keep: nothing here ever `tell`s an app that
// is not running (that launches it), and nothing user-typed reaches a script
// except through a URL that has already passed the link grammar.

export type NativeApp = 'spotify' | 'apple_music';

export const NATIVE_APPS: Record<NativeApp, { name: string; process: string; bundleId: string }> = {
  spotify: { name: 'Spotify', process: 'Spotify', bundleId: 'com.spotify.client' },
  apple_music: { name: 'Music', process: 'Music', bundleId: 'com.apple.Music' },
};

export function isNativeApp(value: unknown): value is NativeApp {
  return value === 'spotify' || value === 'apple_music';
}

export type NativeCommand = 'playpause' | 'play' | 'pause' | 'next' | 'previous';

const COMMANDS: Record<NativeCommand, string> = {
  playpause: 'playpause',
  play: 'play',
  pause: 'pause',
  next: 'next track',
  previous: 'previous track',
};

export function isNativeCommand(value: unknown): value is NativeCommand {
  return typeof value === 'string' && value in COMMANDS;
}

export interface NativeNowPlaying {
  app: NativeApp;
  status: 'playing' | 'paused' | 'stopped';
  title: string;
  artist: string;
  album: string;
  /** Seconds into the track, and the track's length. */
  position: number;
  duration: number;
}

/** Asks System Events, never the app itself — asking the app would launch it. */
export function isRunningScript(app: NativeApp): string[] {
  const { process } = NATIVE_APPS[app];
  return [`tell application "System Events" to (name of processes) contains "${process}"`];
}

/** One tab-separated line: state, title, artist, album, position, duration. */
export function stateScript(app: NativeApp): string[] {
  const { name } = NATIVE_APPS[app];
  // Spotify reports duration in milliseconds; Music in seconds.
  const duration =
    app === 'spotify' ? '(duration of current track) / 1000' : 'duration of current track';
  return [
    `tell application "${name}"`,
    'set s to player state as text',
    'if s is "stopped" then return s',
    `return s & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as integer) & tab & (${duration} as integer)`,
    'end tell',
  ];
}

export function commandScript(app: NativeApp, command: NativeCommand): string[] {
  return [`tell application "${NATIVE_APPS[app].name}" to ${COMMANDS[command]}`];
}

const SPOTIFY_URI = /^spotify:(?:track|album|playlist|artist|episode|show):[A-Za-z0-9]{22}$/;

/** Start a Spotify URI playing in the app. Music has no equivalent verb: its
 *  links open through the OS (`music://`), so this returns null for it. */
export function openScript(app: NativeApp, nativeUrl: string): string[] | null {
  if (app !== 'spotify' || !SPOTIFY_URI.test(nativeUrl)) return null;
  return [`tell application "Spotify" to play track "${nativeUrl}"`];
}

export function parseNativeState(app: NativeApp, stdout: string): NativeNowPlaying | null {
  const line = stdout.trim().split('\n').pop() ?? '';
  const [state = '', title = '', artist = '', album = '', position = '0', duration = '0'] =
    line.split('\t');
  if (state !== 'playing' && state !== 'paused' && state !== 'stopped') return null;
  return {
    app,
    status: state,
    title: title.trim(),
    artist: artist.trim(),
    album: album.trim(),
    position: Math.max(0, Number.parseInt(position, 10) || 0),
    duration: Math.max(0, Number.parseInt(duration, 10) || 0),
  };
}
