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
  notify: (banner: { title: string; body?: string; route?: string }) => void;
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
