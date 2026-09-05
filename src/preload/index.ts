// The renderer's entire capability surface, typed and narrow. Nothing here
// exposes Node, the JWT secret, or the yeaboi-app bearer token. Two backends,
// two trust models on one bridge:
//
// * planning FastAPI — the renderer talks to it directly with short-lived
//   minted JWTs (getAuthToken);
// * yeaboi app — api()/apiStream() are blind relays into the main process,
//   which alone holds the loopback handshake token (api-proxy.ts).

import { contextBridge, ipcRenderer } from 'electron';

export interface AuthPayload {
  token: string;
  apiUrl: string;
  wsUrl: string;
}

export interface Identity {
  email: string;
  name: string;
}

export interface PetNotice {
  quip: string;
  sticky?: boolean;
  route?: string;
}

export interface YeaboiBridge {
  /** A fresh 1h bearer token plus where the planning backend lives. Identity
   *  is auto-minted at startup, so null only survives a malformed store. */
  getAuthToken: () => Promise<AuthPayload | null>;
  getIdentity: () => Promise<Identity | null>;
  setIdentity: (identity: Identity) => Promise<Identity>;
  /** Ask the OS for a folder. Returns '' when the person cancels. */
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ path: string }>;
  /** Show a file in Finder/Explorer. False when it is no longer there. */
  revealPath: (path: string) => Promise<{ revealed: boolean }>;
  /** First-run onboarding: whether the wizard should gate the window, and the
   *  explicit finish/skip that drops the gate (and restarts the planning
   *  sidecar so freshly saved keys reach it). */
  getOnboarding: () => Promise<{ needed: boolean }>;
  completeOnboarding: () => Promise<void>;
  /** The audience world the shell lives in. null means never chosen — the
   *  chooser gates the window once, like onboarding. */
  getAudience: () => Promise<'solo' | 'team' | 'agents' | null>;
  setAudience: (audience: 'solo' | 'team' | 'agents') => Promise<'solo' | 'team' | 'agents' | null>;
  /** The menu bar's World menu flipped the world. */
  onAudience: (callback: (audience: 'solo' | 'team' | 'agents') => void) => void;
  /** One authed call to the yeaboi app backend, relayed through main. */
  api: (
    path: string,
    init?: { method?: string; body?: unknown },
  ) => Promise<{ status: number; body: unknown }>;
  /** The NDJSON half: one parsed line per callback, resolves when the turn is
   *  over. The channel is per call so concurrent streams never cross lines. */
  apiStream: (
    path: string,
    body: unknown,
    onLine: (line: unknown) => void,
  ) => Promise<{ status: number; body: unknown }>;
  /** The yeaboi app sidecar's state — pull half for late-mounting windows. */
  getBackendState: () => Promise<unknown>;
  onBackendState: (callback: (state: unknown) => void) => void;
  /** The ambient feed, read once in main and pushed here: consent requests and
   *  the awareness notices. */
  onEvent: (callback: (event: unknown) => void) => void;
  /** Open one live retro/poker board in its own top-level window, by id. */
  openBoard: (boardId: string) => Promise<unknown>;
  /** Screenshare: main wants a source picked; the renderer lists sources,
   *  draws the picker, and answers with the chosen id ('' = dismissed). */
  onCaptureRequest: (callback: () => void) => void;
  listCaptureSources: () => Promise<
    { id: string; name: string; thumbnail: string; kind: 'screen' | 'window' }[]
  >;
  pickCaptureSource: (sourceId: string) => Promise<unknown>;
  /** Main asking the app to show a route — the tray, or a click on the duck. */
  onNavigate: (callback: (route: string) => void) => void;
  /** The tray asking for the About panel, which is a modal and not a route. */
  onAbout: (callback: () => void) => void;
  /** The Go menu asking for the palette, which is a dialog and not a route. */
  onPalette: (callback: () => void) => void;
  /** The shell's own identity — versions the backend cannot know. */
  appMeta: () => Promise<{
    version: string;
    electron: string;
    chrome: string;
    platform: string;
    arch: string;
    packaged: boolean;
  }>;
  /** The desktop pet. */
  getPetEnabled: () => Promise<boolean>;
  setPetEnabled: (enabled: boolean) => Promise<{ enabled: boolean }>;
  /** App moments forwarded to the duck's speech bubble. */
  petNotify: (notice: PetNotice) => void;
  getPetPrefs: () => Promise<unknown>;
  setPetPrefs: (patch: unknown) => Promise<unknown>;
  /** The rail's icons per world; a patch names the worlds it replaces. */
  getRailPrefs: () => Promise<unknown>;
  setRailPrefs: (patch: unknown) => Promise<unknown>;
  /** Music: the shelf and volume live in main; the native apps are driven there. */
  getMusicPrefs: () => Promise<unknown>;
  setMusicPrefs: (patch: unknown) => Promise<unknown>;
  onMusicCommand: (callback: (id: string) => void) => void;
  musicNativeState: (app: string) => Promise<unknown>;
  musicNativeCommand: (app: string, command: string) => Promise<unknown>;
  musicNativeOpen: (app: string, url: string) => Promise<unknown>;
  musicNativeInstalled: (app: string) => Promise<unknown>;
  /** The Music app's own library, by shelf or playlist; and a click on a row. */
  musicNativeLibrary: (app: string, playlistId?: string) => Promise<unknown>;
  musicNativePlayItem: (app: string, kind: string, id: string) => Promise<unknown>;
  musicNativeLaunch: (app: string) => Promise<unknown>;
  /** A native banner for a run that finished. Clamped in main. */
  notify: (banner: { title: string; body?: string; route?: string }) => void;
  /** The active theme's background — the next window opens in it. */
  setThemeBackground: (colour: string) => void;
  /** Self-update: state, then the three steps a person drives. */
  onUpdateState: (callback: (state: unknown) => void) => void;
  getUpdateState: () => Promise<unknown>;
  checkForUpdate: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
  platform: string;
}

const bridge: YeaboiBridge = {
  getAuthToken: () => ipcRenderer.invoke('auth:get-token'),
  getIdentity: () => ipcRenderer.invoke('auth:get-identity'),
  setIdentity: (identity) => ipcRenderer.invoke('auth:set-identity', identity),
  pickDirectory: (options) => ipcRenderer.invoke('dialog:pick-directory', options),
  revealPath: (path) => ipcRenderer.invoke('shell:reveal-path', path),
  getOnboarding: () => ipcRenderer.invoke('onboarding:get'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
  getAudience: () => ipcRenderer.invoke('audience:get'),
  setAudience: (audience) => ipcRenderer.invoke('audience:set', audience),
  onAudience: (callback) => {
    ipcRenderer.on('app:audience', (_event, audience: 'solo' | 'team' | 'agents') =>
      callback(audience),
    );
  },
  api: (path, init) => ipcRenderer.invoke('api:request', path, init),
  apiStream: (path, body, onLine) => {
    // The channel is per call, so two concurrent turns never cross lines; the
    // listener is removed when the stream ends, however it ends.
    const id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    const channel = `api:stream:${id}`;
    const handler = (_event: unknown, line: unknown) => onLine(line);
    ipcRenderer.on(channel, handler);
    return ipcRenderer
      .invoke('api:stream', path, { method: 'POST', body }, id)
      .finally(() => ipcRenderer.removeListener(channel, handler));
  },
  getBackendState: () => ipcRenderer.invoke('backend:get-state'),
  onBackendState: (callback) => {
    ipcRenderer.on('backend:state', (_event, state: unknown) => callback(state));
  },
  onEvent: (callback) => {
    ipcRenderer.on('app:event', (_event, payload: unknown) => callback(payload));
  },
  openBoard: (boardId) => ipcRenderer.invoke('boards:open', boardId),
  onCaptureRequest: (callback) => {
    ipcRenderer.on('capture:request', () => callback());
  },
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  pickCaptureSource: (sourceId) => ipcRenderer.invoke('capture:pick', sourceId),
  onNavigate: (callback) => {
    ipcRenderer.on('app:navigate', (_event, route: string) => callback(route));
  },
  onAbout: (callback) => {
    ipcRenderer.on('app:about', () => callback());
  },
  onPalette: (callback) => {
    ipcRenderer.on('app:palette', () => callback());
  },
  appMeta: () => ipcRenderer.invoke('app:meta'),
  getPetEnabled: () => ipcRenderer.invoke('pet:get-enabled'),
  setPetEnabled: (enabled) => ipcRenderer.invoke('pet:set-enabled', enabled),
  petNotify: (notice) => ipcRenderer.send('pet:notify', notice),
  getPetPrefs: () => ipcRenderer.invoke('pet:get-prefs'),
  setPetPrefs: (patch) => ipcRenderer.invoke('pet:set-prefs', patch),
  getRailPrefs: () => ipcRenderer.invoke('rail:get-prefs'),
  setRailPrefs: (patch) => ipcRenderer.invoke('rail:set-prefs', patch),
  getMusicPrefs: () => ipcRenderer.invoke('music:get-prefs'),
  setMusicPrefs: (patch) => ipcRenderer.invoke('music:set-prefs', patch),
  onMusicCommand: (callback) => {
    ipcRenderer.on('app:music', (_event, id: string) => callback(id));
  },
  musicNativeState: (app) => ipcRenderer.invoke('music:native-state', app),
  musicNativeCommand: (app, command) => ipcRenderer.invoke('music:native-command', app, command),
  musicNativeOpen: (app, url) => ipcRenderer.invoke('music:native-open', app, url),
  musicNativeInstalled: (app) => ipcRenderer.invoke('music:native-installed', app),
  musicNativeLibrary: (app, playlistId) =>
    ipcRenderer.invoke('music:native-library', app, playlistId ?? ''),
  musicNativePlayItem: (app, kind, id) =>
    ipcRenderer.invoke('music:native-play-item', app, kind, id),
  musicNativeLaunch: (app) => ipcRenderer.invoke('music:native-launch', app),
  notify: (banner) => ipcRenderer.send('app:notify', banner),
  setThemeBackground: (colour) => ipcRenderer.send('theme:background', colour),
  onUpdateState: (callback) => {
    ipcRenderer.on('update:state', (_event, state: unknown) => callback(state));
  },
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('yeaboi', bridge);
