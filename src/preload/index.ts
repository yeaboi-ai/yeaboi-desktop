// The renderer's entire capability surface, typed and narrow. Nothing here
// exposes Node or the JWT secret — the renderer gets short-lived minted
// tokens and talks to the local backend itself.

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
  /** A fresh 1h bearer token plus where the backend lives. Null on first run,
   *  before an identity exists. */
  getAuthToken: () => Promise<AuthPayload | null>;
  getIdentity: () => Promise<Identity | null>;
  setIdentity: (identity: Identity) => Promise<Identity>;
  /** Main asking the app to show a route — the tray, or a click on the duck. */
  onNavigate: (callback: (route: string) => void) => void;
  /** The tray asking for the About panel, which is a modal and not a route. */
  onAbout: (callback: () => void) => void;
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
  onNavigate: (callback) => {
    ipcRenderer.on('app:navigate', (_event, route: string) => callback(route));
  },
  onAbout: (callback) => {
    ipcRenderer.on('app:about', () => callback());
  },
  appMeta: () => ipcRenderer.invoke('app:meta'),
  getPetEnabled: () => ipcRenderer.invoke('pet:get-enabled'),
  setPetEnabled: (enabled) => ipcRenderer.invoke('pet:set-enabled', enabled),
  petNotify: (notice) => ipcRenderer.send('pet:notify', notice),
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
