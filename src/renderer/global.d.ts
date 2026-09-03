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
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ path: string }>;
  revealPath: (path: string) => Promise<{ revealed: boolean }>;
  getOnboarding: () => Promise<{ needed: boolean }>;
  completeOnboarding: () => Promise<void>;
  getAudience: () => Promise<'solo' | 'team' | 'agents' | null>;
  setAudience: (audience: 'solo' | 'team' | 'agents') => Promise<'solo' | 'team' | 'agents' | null>;
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
  /** Turn the duck on and land him where he jumped from, in screen coords. */
  petHandoff: (point: { x: number; y: number }) => Promise<unknown>;
  petAnchor: (point: { x: number; y: number }) => void;
  minimiseWindow: () => void;
  /** The duck has finished his introduction and is coming back inside. */
  onPetReturned: (fn: () => void) => void;
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
