// Spotify and Music, driven through osascript — the way pet.ts asks the Dock
// where it is. Every script comes from src/shared/music-native.ts as data;
// this file only runs them, with a timeout, and only on macOS.
//
// The one rule that matters: ask System Events whether the app is running
// before ever addressing the app, because `tell application "Spotify"` on a
// closed Spotify launches it, and a poll must never open an app by itself.

import { execFile } from 'node:child_process';
import { ipcMain, shell } from 'electron';
import {
  NATIVE_APPS,
  commandScript,
  isNativeApp,
  isNativeCommand,
  isPersistentId,
  isRunningScript,
  libraryPlaylistsScript,
  libraryTracksScript,
  openScript,
  parseNativePlaylists,
  parseNativeState,
  parseNativeTracks,
  playItemScript,
  stateScript,
  type NativeApp,
  type NativeNowPlaying,
} from '../shared/music-native';
import { parseMusicLink } from '../shared/music-links';

const TIMEOUT_MS = 1_500;
/** A library read walks lists; a big playlist takes longer than a state poll. */
const LIBRARY_TIMEOUT_MS = 20_000;
const darwin = process.platform === 'darwin';

function osascript(lines: string[], timeout = TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const args = lines.flatMap((line) => ['-e', line]);
    execFile('osascript', args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : String(stdout));
    });
  });
}

async function isRunning(app: NativeApp): Promise<boolean> {
  const out = await osascript(isRunningScript(app));
  return out?.trim() === 'true';
}

/** What the app is playing, or null when it is closed or unreachable. */
export async function nativeState(app: NativeApp): Promise<NativeNowPlaying | null> {
  if (!darwin || !(await isRunning(app))) return null;
  const out = await osascript(stateScript(app));
  return out === null ? null : parseNativeState(app, out, Date.now());
}

const installed = new Map<NativeApp, boolean>();

/** Whether the app is on this Mac, by bundle id. Cached: apps do not come and
 *  go within a session, and mdfind is not free. */
export function nativeInstalled(app: NativeApp): Promise<boolean | null> {
  if (!darwin) return Promise.resolve(null);
  const known = installed.get(app);
  if (known !== undefined) return Promise.resolve(known);
  return new Promise((resolve) => {
    const query = `kMDItemCFBundleIdentifier == '${NATIVE_APPS[app].bundleId}'`;
    execFile('mdfind', [query], { timeout: 3_000 }, (error, stdout) => {
      const found = !error && String(stdout).trim().length > 0;
      installed.set(app, found);
      resolve(found);
    });
  });
}

export function registerMusicNative(): void {
  ipcMain.handle('music:native-state', (_event, app: unknown) =>
    isNativeApp(app) ? nativeState(app) : null,
  );
  ipcMain.handle('music:native-installed', (_event, app: unknown) =>
    isNativeApp(app) ? nativeInstalled(app) : null,
  );
  ipcMain.handle('music:native-command', async (_event, app: unknown, command: unknown) => {
    if (!darwin || !isNativeApp(app) || !isNativeCommand(command)) return { ok: false };
    // A command to a closed app would open it; the transport is for what is on.
    if (!(await isRunning(app))) return { ok: false };
    const out = await osascript(commandScript(app, command));
    return { ok: out !== null };
  });
  ipcMain.handle('music:native-open', async (_event, app: unknown, url: unknown) => {
    // The renderer sends the share link as pasted; the native URL is derived
    // here from the same grammar, so nothing typed reaches a script or the OS.
    if (!isNativeApp(app) || typeof url !== 'string') return { ok: false };
    const link = parseMusicLink(url);
    if (!link?.nativeUrl) return { ok: false };
    const script = darwin ? openScript(app, link.nativeUrl) : null;
    if (script && (await isRunning(app))) {
      const out = await osascript(script);
      if (out !== null) return { ok: true, via: 'script' };
    }
    await shell.openExternal(link.nativeUrl);
    return { ok: true, via: 'external' };
  });
  // The Music app's own library, read only while the app is running: a
  // browse must not launch it either. `{running: false}` is the answer then.
  ipcMain.handle('music:native-library', async (_event, app: unknown, playlistId: unknown) => {
    if (!darwin || !isNativeApp(app)) return { running: false, items: [] };
    if (!(await isRunning(app))) return { running: false, items: [] };
    const script =
      typeof playlistId === 'string' && playlistId
        ? libraryTracksScript(app, playlistId)
        : libraryPlaylistsScript(app);
    if (!script) return { running: true, items: [] };
    const out = await osascript(script, LIBRARY_TIMEOUT_MS);
    if (out === null) return { running: true, items: [] };
    const items = playlistId ? parseNativeTracks(out) : parseNativePlaylists(out);
    return { running: true, items };
  });
  // A click on a row: may launch the app, which is what the click asked for.
  ipcMain.handle(
    'music:native-play-item',
    async (_event, app: unknown, kind: unknown, id: unknown) => {
      if (!darwin || !isNativeApp(app) || !isPersistentId(id)) return { ok: false };
      const script = kind === 'playlist' || kind === 'track' ? playItemScript(app, kind, id) : null;
      if (!script) return { ok: false };
      const out = await osascript(script, LIBRARY_TIMEOUT_MS);
      return { ok: out !== null };
    },
  );
  ipcMain.handle('music:native-launch', async (_event, app: unknown) => {
    if (!darwin || !isNativeApp(app)) return { ok: false };
    const out = await osascript([`tell application "${NATIVE_APPS[app].name}" to activate`]);
    return { ok: out !== null };
  });
}
