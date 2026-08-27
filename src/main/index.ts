// Electron main — app lifecycle, the main window, and the security posture
// every window shares: contextIsolation, no nodeIntegration, sandbox, no
// navigation off the app, external links to the OS browser.
//
// There is no bundled backend any more: the renderer talks straight to the
// planning-platform FastAPI on localhost, and what main owns is identity —
// it holds the shared JWT secret and mints short-lived tokens on request
// (auth.ts). The duck persists in the tray with the window closed, and the
// desktop pet is a window of its own.

import { join } from 'node:path';
import { BrowserWindow, app, ipcMain, session, shell } from 'electron';
import { mintToken } from './auth';
import { Pet, type PetNotice } from './pet';
import { installPermissionHandlers, navigationAllowed } from './permissions';
import { APP_ORIGIN, installAppScheme, registerAppScheme } from './protocol';
import { Settings, type Identity } from './settings';
import { AppTray } from './tray';
import { Updater } from './updater';

const settings = new Settings();
const pet = new Pet();
const updater = new Updater();
let mainWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;

registerAppScheme();

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a0a', // planning theme dark background — no white flash
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links open in the OS browser; anything else is denied.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }
}

/** Bring the app forward, optionally at a route. Used by the tray and by a
 *  click on a duck that is holding a question. */
function openApp(route = ''): void {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  const window = mainWindow;
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (route) window.webContents.send('app:navigate', route);
}

/** Bring the window forward with the About panel open. The panel is a modal,
 *  not a route, so the tray asks for it rather than navigating to it. */
function showAbout(): void {
  openApp();
  mainWindow?.webContents.send('app:about');
}

function setPetPreference(enabled: boolean): void {
  settings.setPetEnabled(enabled);
  pet.setEnabled(enabled);
  tray?.setPetEnabled(enabled);
}

// Global hardening for every webContents this app ever creates (pet included).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!navigationAllowed(url, process.env['ELECTRON_RENDERER_URL'])) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => openApp());

  void app.whenReady().then(() => {
    settings.load();
    installAppScheme(join(import.meta.dirname, '../renderer'));
    installPermissionHandlers(
      (listener) => app.on('session-created', listener),
      session.defaultSession,
      (contents) => contents !== null && contents === mainWindow?.webContents,
    );
    pet.register((route) => openApp(route));

    // Identity + tokens. A null token payload means first run — the renderer
    // shows the identity screen and calls auth:set-identity.
    ipcMain.handle('auth:get-token', () => mintToken(settings));
    ipcMain.handle('auth:get-identity', () => settings.identity);
    ipcMain.handle('auth:set-identity', (_event, identity: unknown) => {
      const id = identity as Identity;
      if (typeof id?.email !== 'string' || !id.email.includes('@')) {
        throw new Error('identity needs an email');
      }
      settings.setIdentity({ email: id.email, name: String(id.name ?? id.email) });
      return settings.identity;
    });

    // The desktop duck. The renderer forwards app moments (a suggestion
    // landed, the wizard committed) as short quips; validation is here so a
    // compromised renderer cannot flood arbitrary payloads at the pet window.
    ipcMain.on('pet:notify', (_event, notice: unknown) => {
      const n = notice as PetNotice;
      if (typeof n?.quip !== 'string' || !n.quip) return;
      pet.notify({
        quip: n.quip.slice(0, 80),
        sticky: Boolean(n.sticky),
        route: typeof n.route === 'string' ? n.route.slice(0, 200) : '',
      });
    });
    ipcMain.handle('pet:set-enabled', (_event, enabled: unknown) => {
      setPetPreference(Boolean(enabled));
      return { enabled: pet.on };
    });
    ipcMain.handle('pet:get-enabled', () => settings.petEnabled);

    ipcMain.handle('app:meta', () => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
    }));
    ipcMain.handle('update:get-state', () => updater.current);
    ipcMain.handle('update:check', () => updater.check());
    ipcMain.handle('update:download', () => updater.download());
    ipcMain.handle('update:install', () => updater.install());
    updater.onState((state) => {
      tray?.setUpdateState(state);
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('update:state', state);
    });

    createMainWindow();
    pet.setEnabled(settings.petEnabled);
    tray = new AppTray(pet, {
      open: () => openApp(),
      about: () => showAbout(),
      // One menu item for the whole update sequence: it does whatever the
      // state it is showing says it does.
      update: () => {
        if (updater.current.kind === 'ready') updater.install();
        else if (updater.current.kind === 'available') void updater.download();
        else void updater.check();
      },
      togglePet: (enabled) => setPetPreference(enabled),
      quit: () => app.quit(),
    });
    tray.create(settings.petEnabled);

    app.on('activate', () => openApp());
  });

  app.on('window-all-closed', () => {
    // Deliberately no quit: the tray is the app's other home, and the duck may
    // still be on the desktop with the window shut. Quit is the tray's Quit.
  });

  app.on('before-quit', () => {
    pet.hide();
    tray?.destroy();
  });
}
