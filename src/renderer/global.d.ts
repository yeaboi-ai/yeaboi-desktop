// The preload bridge as the renderer sees it (src/preload/index.ts is the
// source of truth for the shapes).

interface YeaboiAuthPayload {
  token: string;
  apiUrl: string;
  wsUrl: string;
}

interface YeaboiIdentity {
  email: string;
  name: string;
}

interface YeaboiBridge {
  getAuthToken: () => Promise<YeaboiAuthPayload | null>;
  getIdentity: () => Promise<YeaboiIdentity | null>;
  setIdentity: (identity: YeaboiIdentity) => Promise<YeaboiIdentity>;
  pickPaths: (options: {
    title?: string;
    defaultPath?: string;
    kind: 'file' | 'folder';
    multi?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<{ paths: string[] }>;
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ path: string }>;
  revealPath: (path: string) => Promise<{ revealed: boolean }>;
  getOnboarding: () => Promise<{ needed: boolean }>;
  completeOnboarding: () => Promise<void>;
  getAudience: () => Promise<'solo' | 'team' | null>;
  setAudience: (audience: 'solo' | 'team') => Promise<'solo' | 'team' | null>;
  onAudience: (callback: (audience: 'solo' | 'team') => void) => void;
  getSolo: () => Promise<boolean | null>;
  onSolo: (callback: (enabled: boolean) => void) => void;
  api: (
    path: string,
    init?: { method?: string; body?: unknown },
  ) => Promise<{ status: number; body: unknown }>;
  apiStream: (
    path: string,
    body: unknown,
    onLine: (line: unknown) => void,
  ) => Promise<{ status: number; body: unknown }>;
  getBackendState: () => Promise<unknown>;
  onBackendState: (callback: (state: unknown) => void) => void;
  onEvent: (callback: (event: unknown) => void) => void;
  openBoard: (boardId: string) => Promise<unknown>;
  onCaptureRequest: (callback: () => void) => void;
  listCaptureSources: () => Promise<
    { id: string; name: string; thumbnail: string; kind: 'screen' | 'window' }[]
  >;
  pickCaptureSource: (sourceId: string) => Promise<unknown>;
  onNavigate: (callback: (route: string) => void) => void;
  onAbout: (callback: () => void) => void;
  onPalette: (callback: () => void) => void;
  appMeta: () => Promise<{
    version: string;
    electron: string;
    chrome: string;
    platform: string;
    arch: string;
    packaged: boolean;
  }>;
  getPetEnabled: () => Promise<boolean>;
  setPetEnabled: (enabled: boolean) => Promise<{ enabled: boolean }>;
  petNotify: (notice: { quip: string; sticky?: boolean; route?: string }) => void;
  getPetPrefs: () => Promise<unknown>;
  setPetPrefs: (patch: unknown) => Promise<unknown>;
  getRailPrefs: () => Promise<unknown>;
  setRailPrefs: (patch: unknown) => Promise<unknown>;
  getMusicPrefs: () => Promise<unknown>;
  setMusicPrefs: (patch: unknown) => Promise<unknown>;
  onMusicCommand: (callback: (id: string) => void) => void;
  musicNativeState: (app: string) => Promise<unknown>;
  musicNativeCommand: (app: string, command: string) => Promise<unknown>;
  musicNativeOpen: (app: string, url: string) => Promise<unknown>;
  musicNativeInstalled: (app: string) => Promise<unknown>;
  /** Optional: absent on a preload older than the renderer (a hot reload). */
  onMusicLink?: (callback: (url: string) => void) => void;
  musicNativeLibrary: (app: string, playlistId?: string) => Promise<unknown>;
  musicNativePlayItem: (app: string, kind: string, id: string) => Promise<unknown>;
  musicNativeLaunch: (app: string) => Promise<unknown>;
  notify: (banner: { title: string; body?: string; route?: string }) => void;
  setThemeBackground: (colour: string) => void;
  onUpdateState: (callback: (state: unknown) => void) => void;
  getUpdateState: () => Promise<unknown>;
  checkForUpdate: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
  platform: string;
}

interface Window {
  yeaboi: YeaboiBridge;
}
