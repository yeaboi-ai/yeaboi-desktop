// Electron main — app lifecycle, the main window, and the security posture
// every window shares: contextIsolation, no nodeIntegration, sandbox, no
// navigation off the app, external links to the OS browser.
//
// Main supervises two backends with two trust models:
//
// * the planning-platform FastAPI — the renderer talks to it directly on
//   localhost, and main owns identity: it holds the shared JWT secret and
//   mints short-lived tokens on request (auth.ts);
// * the yeaboi app Python sidecar (sidecar.ts) — its bearer token never
//   leaves this process, so every renderer call relays through api-proxy.ts,
//   and the ambient SSE feed is read once here (events.ts). Live retro/poker
//   boards get their own top-level windows (boards.ts) because a board page
//   refuses to be framed and its host URL carries an admin token.
//
// The duck persists in the tray with the window closed, and the desktop pet
// is a window of its own.

import { join } from 'node:path';
import { BrowserWindow, app, ipcMain, session, shell } from 'electron';
import { registerApiProxy } from './api-proxy';
import { mintToken } from './auth';
import { closeAllBoardWindows, registerBoardWindows } from './boards';
import { ensureMediaAccess, registerCapture } from './capture';
import { EventReader, broadcast } from './events';
import { LivekitSidecar } from './livekit';
import { Notifier } from './notify';
import { Pet, type PetNotice } from './pet';
import { clampBanner, noticeTitle } from '../shared/notices';
import type { PetPrefs } from '../shared/pet-prefs';
import { installPermissionHandlers, navigationAllowed } from './permissions';
import { PlanningSidecar } from './planning';
import { APP_ORIGIN, installAppScheme, registerAppScheme } from './protocol';
import { loadMachineSecrets } from './secrets';
import { Settings, type Identity } from './settings';
import { Sidecar } from './sidecar';
import { AppTray } from './tray';
import { Updater } from './updater';
import { VoiceAgentSidecar, registerVoicePack, voicePackInstalled } from './voice-pack';

const settings = new Settings();
const sidecar = new Sidecar();
const planning = new PlanningSidecar();
const livekit = new LivekitSidecar();
const voiceAgent = new VoiceAgentSidecar();
const events = new EventReader(sidecar);
const pet = new Pet();
const notifier = new Notifier((route) => openApp(route));
const updater = new Updater();
let mainWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;

// An externally provided backend URL means "mine, don't spawn one" — the dev
// escape hatch for pointing the renderer at a hand-run planning server.
const externalPlanningUrl = process.env['YEABOI_API_URL'] ?? '';

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

/** The one path a duck preference travels: store, window, tray checkbox. */
function setPetPreference(patch: Partial<PetPrefs>): PetPrefs {
  const prefs = settings.setPet(patch);
  pet.setPrefs(prefs);
  tray?.setPetEnabled(prefs.enabled);
  return prefs;
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
    // Machine secrets under ~/.yeaboi/planning: generated on first run. The
    // JWT secret main mints with must equal the NEXTAUTH_SECRET the local
    // planning sidecar runs under — same file, same value. An explicit
    // $YEABOI_JWT_SECRET (external backend dev) still wins in settings.ts.
    if (!externalPlanningUrl) {
      process.env['YEABOI_JWT_SECRET'] ??= loadMachineSecrets().nextauthSecret;
      void planning.start();
    }
    planning.onState((state) => {
      console.log(
        `[planning] ${state.kind}${state.kind === 'down' ? `: ${state.reason}` : ''}${state.kind === 'ready' ? ` at ${state.url}` : ''}`,
      );
    });

    // LiveKit — voice/video calls. Optional: 'down' just disables calls.
    void livekit.start();
    livekit.onState((state) => {
      console.log(
        `[livekit] ${state.kind}${state.kind === 'down' ? `: ${state.reason}` : ''}${state.kind === 'ready' && state.external ? ' (external)' : ''}`,
      );
    });
    registerCapture(session.defaultSession, () => {
      mainWindow?.webContents.send('capture:request');
    });
    void ensureMediaAccess();

    // The voice agent (facilitator's STT→LLM→TTS loop) — only once both the
    // planning backend and LiveKit are up, and only when the pack is there.
    registerVoicePack();
    const maybeStartVoiceAgent = () => {
      const planningUrl =
        externalPlanningUrl || (planning.current.kind === 'ready' ? planning.current.url : '');
      if (!planningUrl) return;
      if (livekit.current.kind !== 'ready') return;
      if (!voicePackInstalled()) return;
      voiceAgent.start(planningUrl);
    };
    planning.onState(maybeStartVoiceAgent);
    livekit.onState(maybeStartVoiceAgent);
    installAppScheme(join(import.meta.dirname, '../renderer'));
    installPermissionHandlers(
      (listener) => app.on('session-created', listener),
      session.defaultSession,
      (contents) => contents !== null && contents === mainWindow?.webContents,
    );
    pet.register((route) => openApp(route));

    // The yeaboi app sidecar: proxy, board windows, and state relay. The
    // renderer never sees the handshake — both halves strip it before the
    // state crosses the bridge.
    registerApiProxy(sidecar);
    registerBoardWindows(sidecar);
    ipcMain.handle('backend:get-state', () => {
      const state = sidecar.current;
      if (state.kind !== 'ready') return state;
      return { kind: 'ready' };
    });
    sidecar.onState((state) => {
      console.log(`[backend] ${state.kind}${state.kind === 'down' ? `: ${state.reason}` : ''}`);
      const safe = state.kind === 'ready' ? { kind: 'ready' } : state;
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('backend:state', safe);
      }
    });

    // One reader for the ambient feed: the renderer gets everything (the
    // consent modal lives there), the duck gets only what he can say.
    events.start();
    broadcast(events, () => (mainWindow && !mainWindow.isDestroyed() ? [mainWindow] : []));
    events.on((event) => {
      if (event.type !== 'notice') return;
      const quip = String(event['quip'] ?? '');
      const route = String(event['route'] ?? '');
      const prefs = settings.pet;
      if (prefs.notify.bubble) {
        pet.notify({ quip, sticky: Boolean(event['sticky']), route } satisfies PetNotice);
      }
      // These are the things that happened with nobody looking, so the banner
      // is the point of them — it goes out whether or not a window is open.
      if (prefs.notify.os) {
        notifier.post({ title: noticeTitle(String(event['kind'] ?? '')), body: quip, route });
      }
    });
    void sidecar.start();

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
      setPetPreference({ enabled: Boolean(enabled) });
      return { enabled: pet.on };
    });
    ipcMain.handle('pet:get-enabled', () => settings.petEnabled);
    ipcMain.handle('pet:get-prefs', () => settings.pet);
    ipcMain.handle('pet:set-prefs', (_event, patch: unknown) =>
      setPetPreference((patch ?? {}) as Partial<PetPrefs>),
    );

    // A banner the renderer asked for: a run it was streaming has finished.
    // Clamped here for the same reason `pet:notify` is.
    ipcMain.on('app:notify', (_event, banner: unknown) => {
      const clamped = clampBanner(banner);
      if (clamped) notifier.post(clamped);
    });

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
    pet.setPrefs(settings.pet);
    tray = new AppTray({
      open: () => openApp(),
      about: () => showAbout(),
      // One menu item for the whole update sequence: it does whatever the
      // state it is showing says it does.
      update: () => {
        if (updater.current.kind === 'ready') updater.install();
        else if (updater.current.kind === 'available') void updater.download();
        else void updater.check();
      },
      togglePet: (enabled) => void setPetPreference({ enabled }),
      nudgePet: (delta) => void setPetPreference({ raise: settings.pet.raise + delta }),
      recenterPet: () => pet.recenter(),
      petSettings: () => openApp('/settings?tab=duck'),
      quit: () => app.quit(),
    });
    tray.create(settings.petEnabled);

    app.on('activate', () => openApp());
  });

  app.on('window-all-closed', () => {
    // Deliberately no quit: the tray is the app's other home, and the duck may
    // still be on the desktop with the window shut. Quit is the tray's Quit.
  });

  let cleanShutdown = false;
  app.on('before-quit', (event) => {
    if (cleanShutdown) return;
    event.preventDefault();
    // The windows first: the sidecar's own shutdown closes the board servers
    // underneath them, and a window left pointing at a dead port shows an
    // error page on the way out.
    closeAllBoardWindows();
    pet.hide();
    events.stop();
    tray?.destroy();
    void Promise.allSettled([
      voiceAgent.stop(),
      livekit.stop(),
      planning.stop(),
      sidecar.stop(),
    ]).finally(() => {
      cleanShutdown = true;
      app.quit();
    });
  });
}
