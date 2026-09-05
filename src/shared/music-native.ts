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
  /** Clock at the poll, so the position can run forward between polls. */
  asOf: number;
  /** Spotify's cover on i.scdn.co; Music has no URL for its art. */
  artworkUrl: string | null;
}

const ARTWORK_URL = /^https:\/\/i\.scdn\.co\/[A-Za-z0-9/._-]+$/;

/** Asks System Events, never the app itself — asking the app would launch it. */
export function isRunningScript(app: NativeApp): string[] {
  const { process } = NATIVE_APPS[app];
  return [`tell application "System Events" to (name of processes) contains "${process}"`];
}

/** One tab-separated line: state, title, artist, album, position, duration,
 *  artwork URL (Spotify only; Music's art is a blob, so its field is empty). */
export function stateScript(app: NativeApp): string[] {
  const { name } = NATIVE_APPS[app];
  // Spotify reports duration in milliseconds; Music in seconds.
  const duration =
    app === 'spotify' ? '(duration of current track) / 1000' : 'duration of current track';
  const artwork = app === 'spotify' ? '(artwork url of current track)' : '""';
  return [
    `tell application "${name}"`,
    'set s to player state as text',
    'if s is "stopped" then return s',
    `return s & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as integer) & tab & (${duration} as integer) & tab & ${artwork}`,
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

/** Music's persistent IDs: sixteen upper-case hex digits. The one shape a
 *  user-picked value may take before it reaches a script. */
const PERSISTENT_ID = /^[0-9A-F]{16}$/;

export function isPersistentId(value: unknown): value is string {
  return typeof value === 'string' && PERSISTENT_ID.test(value);
}

/** How many rows a library read hands back at most; a shelf, not a dump. */
export const NATIVE_LIBRARY_LIMIT = 500;

/** The user's playlists in Music, one `id<tab>name` line each. Properties are
 *  fetched a list at a time — one Apple Event per property, never one per row,
 *  which is the difference between a blink and a minute. Music only. */
export function libraryPlaylistsScript(app: NativeApp): string[] | null {
  if (app !== 'apple_music') return null;
  return [
    'tell application "Music"',
    'set theIds to persistent ID of user playlists',
    'set theNames to name of user playlists',
    'set out to ""',
    'repeat with i from 1 to count of theIds',
    'set out to out & (item i of theIds) & tab & (item i of theNames) & linefeed',
    'end repeat',
    'return out',
    'end tell',
  ];
}

/** The tracks of one playlist: `id<tab>name<tab>artist<tab>album<tab>seconds`. */
export function libraryTracksScript(app: NativeApp, playlistId: string): string[] | null {
  if (app !== 'apple_music' || !isPersistentId(playlistId)) return null;
  return [
    'tell application "Music"',
    `set p to first user playlist whose persistent ID is "${playlistId}"`,
    // An empty playlist has no list to read; asking is an error, not [].
    'if (count of tracks of p) is 0 then return ""',
    'set theIds to persistent ID of tracks of p',
    'set theNames to name of tracks of p',
    'set theArtists to artist of tracks of p',
    'set theAlbums to album of tracks of p',
    'set theDurations to duration of tracks of p',
    'set out to ""',
    'repeat with i from 1 to count of theIds',
    `if i > ${NATIVE_LIBRARY_LIMIT} then exit repeat`,
    'set out to out & (item i of theIds) & tab & (item i of theNames) & tab & (item i of theArtists) & tab & (item i of theAlbums) & tab & ((item i of theDurations) as integer) & linefeed',
    'end repeat',
    'return out',
    'end tell',
  ];
}

export type NativeItemKind = 'playlist' | 'track';

/** Start a playlist or a track in Music, by persistent ID. Launches the app if
 *  it is closed — this is the one script that may, because it is a click. */
export function playItemScript(app: NativeApp, kind: NativeItemKind, id: string): string[] | null {
  if (app !== 'apple_music' || !isPersistentId(id)) return null;
  if (kind === 'playlist')
    return [
      `tell application "Music" to play (first user playlist whose persistent ID is "${id}")`,
    ];
  if (kind === 'track')
    return [
      `tell application "Music" to play (first track of library playlist 1 whose persistent ID is "${id}")`,
    ];
  return null;
}

export interface NativeLibraryItem {
  id: string;
  kind: NativeItemKind;
  title: string;
  subtitle: string;
  /** Seconds; 0 for a playlist. */
  duration: number;
}

function lines(stdout: string): string[][] {
  return stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cells) => isPersistentId(cells[0] ?? ''));
}

export function parseNativePlaylists(stdout: string): NativeLibraryItem[] {
  return lines(stdout).map(([id = '', name = '']) => ({
    id,
    kind: 'playlist',
    title: name.trim(),
    subtitle: '',
    duration: 0,
  }));
}

export function parseNativeTracks(stdout: string): NativeLibraryItem[] {
  return lines(stdout).map(([id = '', name = '', artist = '', album = '', seconds = '0']) => ({
    id,
    kind: 'track',
    title: name.trim(),
    subtitle: [artist.trim(), album.trim()].filter(Boolean).join(' · '),
    duration: Math.max(0, Number.parseInt(seconds, 10) || 0),
  }));
}

export function parseNativeState(
  app: NativeApp,
  stdout: string,
  asOf = 0,
): NativeNowPlaying | null {
  const line = stdout.trim().split('\n').pop() ?? '';
  const [
    state = '',
    title = '',
    artist = '',
    album = '',
    position = '0',
    duration = '0',
    artwork = '',
  ] = line.split('\t');
  if (state !== 'playing' && state !== 'paused' && state !== 'stopped') return null;
  const artworkUrl = artwork.trim();
  return {
    app,
    status: state,
    title: title.trim(),
    artist: artist.trim(),
    album: album.trim(),
    position: Math.max(0, Number.parseInt(position, 10) || 0),
    duration: Math.max(0, Number.parseInt(duration, 10) || 0),
    asOf,
    artworkUrl: ARTWORK_URL.test(artworkUrl) ? artworkUrl : null,
  };
}
