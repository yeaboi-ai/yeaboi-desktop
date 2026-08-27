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
