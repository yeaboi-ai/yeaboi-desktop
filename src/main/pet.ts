// The duck pet: one transparent, click-through, always-on-top window stretched
// across the primary display.
//
// The trick that makes a desktop pet work at all is `setIgnoreMouseEvents(true,
// {forward: true})` — every app underneath keeps working normally, but the
// renderer still hears about the cursor. When the pointer is over the duck's
// hitbox the renderer says so (`pet:interactive`) and the window goes solid for
// that instant, which is the only reason the duck is grab-able.
//
// Ported from the standalone desktop-pet prototype (origin/feature/desktop-pet).
// The physics, gait and sprites are unchanged; what is new is that the window
// belongs to a real app rather than being one — no `app.dock.hide()`, a shared
// tray, and a duck that knows what yeaboi is doing.

import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { DOCK_SCRIPT, type DockRect, dockConfig, parseDockRect } from './dock';
import { PET_DEFAULTS, type PetPrefs } from '../shared/pet-prefs';
import { petFeedsActive, petWindowCommand } from '../shared/pet-visibility';

/** Window-local cursor feed rate. 16ms is one frame at 60fps — the duck flees
 *  a moving pointer, so a slower feed reads as a stutter. */
const CURSOR_FEED_MS = 16;
/** The dock can move, resize or hide; the floor is re-polled on this cadence. */
const LAYOUT_POLL_MS = 2_000;

export interface PetNotice {
  quip: string;
  sticky: boolean;
  route: string;
}

/** Ask macOS where the Dock is, so the duck can stand on it and walk off its
 *  edges. Uses the Accessibility API via System Events — the first call prompts
 *  for permission, and a refusal simply means floor-only. */
function queryDockRect(callback: (rect: DockRect | null) => void): void {
  if (process.platform !== 'darwin') {
    callback(null);
    return;
  }
  const script = DOCK_SCRIPT.flatMap((line) => ['-e', line]);
  execFile('osascript', script, { timeout: 1_500 }, (error, stdout) => {
    callback(error ? null : parseDockRect(stdout));
  });
}

export class Pet {
  private window: BrowserWindow | null = null;
  private layoutTimer: NodeJS.Timeout | null = null;
  private cursorTimer: NodeJS.Timeout | null = null;
  /** The live window's feed callbacks — set at creation, cleared with it. */
  private feeds: { layout: () => void; cursor: () => void } | null = null;
  private prefs: PetPrefs = PET_DEFAULTS;
  private enabled = false;
  /** An app window is focused; the duck hides rather than walk over it. */
  private suppressed = false;
  /** He has just been let out and is showing where he lives; outranks
   *  suppression until he heads back in. */
  private introducing = false;
  /** Told when the introduction ends, so the window can bring him back in. */
  private onIntroDone: () => void = () => undefined;
  /** The app is quitting; no state change may revive the window. */
  private quitting = false;
  /** Where a click on a duck holding a question should land. */
  private onOpen: (route: string) => void = () => undefined;

  get on(): boolean {
    return this.enabled;
  }

  /** Wire the IPC the pet renderer talks over. Called once, at app ready. */
  register(onOpen: (route: string) => void): void {
    this.onOpen = onOpen;
    // The renderer decides, frame by frame, whether the pointer is over the
    // duck; `over` makes the window solid so the click lands on him.
    ipcMain.on('pet:interactive', (_event, over: unknown) => {
      const window = this.window;
      if (window && !window.isDestroyed()) window.setIgnoreMouseEvents(!over, { forward: true });
    });
    ipcMain.on('pet:open', (_event, route: unknown) => {
      this.onOpen(typeof route === 'string' ? route : '');
    });
    // He has said his piece and leapt back at the window. Suppression applies
    // again from here, so he behaves like any other duck: seen when the app is
    // not in front.
    ipcMain.on('pet:intro-done', () => {
      if (!this.introducing) return;
      this.introducing = false;
      this.applyVisibility();
      this.onIntroDone();
    });
  }

  /** Wire the window's half of the introduction: what to do when he is home. */
  onIntroduced(callback: () => void): void {
    this.onIntroDone = callback;
  }

  /** The single entry point for what the duck is: size, colour, gait, and
   *  whether it exists at all. Sent on to a live window; applied on load to a
   *  new one. */
  setPrefs(prefs: PetPrefs): void {
    this.prefs = prefs;
    this.enabled = prefs.enabled;
    this.applyVisibility();
    if (this.enabled) this.sendPrefs();
  }

  setEnabled(enabled: boolean): void {
    this.setPrefs({ ...this.prefs, enabled });
  }

  /** Hide the duck while an app window is focused; bring him back on blur.
   *  Orthogonal to `prefs.enabled` — the tray checkbox never flips with focus. */
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.applyVisibility();
  }

  /** Reconcile the window with `enabled × suppressed`. Suppression hides
   *  rather than destroys, so the duck resumes mid-scene instead of
   *  re-hatching on every alt-tab. */
  private applyVisibility(): void {
    // During quit the main window's `closed` handler and the blur-settle timer
    // still fire; without this latch either would hatch a fresh duck
    // mid-teardown, after the tray is already gone.
    if (this.quitting) return;
    const window = this.window && !this.window.isDestroyed() ? this.window : null;
    const command = petWindowCommand(
      { enabled: this.enabled, suppressed: this.suppressed, introducing: this.introducing },
      { exists: window !== null, visible: window?.isVisible() ?? false },
    );
    switch (command) {
      case 'destroy':
        this.destroyWindow();
        break;
      case 'create-hidden':
      case 'create-visible':
        this.createWindow(command === 'create-visible');
        break;
      case 'hide':
        window?.hide();
        break;
      case 'show':
        window?.showInactive(); // focusable: false — never steal focus
        break;
    }
    this.syncFeeds();
  }

  /** Start or stop the dock poll and cursor feed to match visibility. */
  private syncFeeds(): void {
    const active =
      petFeedsActive(
        { enabled: this.enabled, suppressed: this.suppressed, introducing: this.introducing },
        this.window !== null && !this.window.isDestroyed(),
      ) && this.feeds !== null;
    if (!active) {
      this.clearFeeds();
      return;
    }
    if (this.layoutTimer || !this.feeds) return; // already running
    this.feeds.layout(); // the dock may have moved while the duck was hidden
    this.layoutTimer = setInterval(this.feeds.layout, LAYOUT_POLL_MS);
    this.cursorTimer = setInterval(this.feeds.cursor, CURSOR_FEED_MS);
  }

  private clearFeeds(): void {
    if (this.layoutTimer) clearInterval(this.layoutTimer);
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.layoutTimer = null;
    this.cursorTimer = null;
  }

  private sendPrefs(): void {
    const window = this.window;
    if (window && !window.isDestroyed()) window.webContents.send('pet:prefs', this.prefs);
  }

  /** Tell the duck about something that happened while nobody was looking. */
  notify(notice: PetNotice): void {
    const window = this.window;
    if (window && !window.isDestroyed()) window.webContents.send('pet:notice', notice);
  }

  recenter(): void {
    const window = this.window;
    if (window && !window.isDestroyed()) window.webContents.send('pet:recenter');
  }

  /**
   * The duck leaves the app window for the desktop, landing where he jumped
   * from rather than materialising mid-screen.
   *
   * `screenPoint` is where the in-app duck was, in screen coordinates. The
   * overlay covers a whole display, so the arrival is that point less the
   * overlay's own origin. Sending it after `setEnabled` is deliberate: the
   * window may not exist yet, and `pet:arrive` has to reach the one that gets
   * created — hence the retry on `did-finish-load` rather than a bare send.
   */
  handoff(screenPoint: { x: number; y: number }): void {
    // Before `setEnabled`, so the window is created visible: accepting is a
    // click inside the app, so the app is focused, so a duck that waited for
    // suppression to lift would arrive invisible.
    this.introducing = true;
    this.setEnabled(true);
    const window = this.window;
    if (!window || window.isDestroyed()) {
      this.introducing = false;
      return;
    }
    const bounds = window.getBounds();
    const local = { x: screenPoint.x - bounds.x, y: screenPoint.y - bounds.y };
    const send = (): void => {
      if (window.isDestroyed()) return;
      window.webContents.send('pet:arrive', { ...local, intro: true });
    };
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
    else send();
  }

  /** Tear the duck down for app quit. Latches: nothing revives him after. */
  hide(): void {
    this.quitting = true;
    this.destroyWindow();
  }

  private destroyWindow(): void {
    this.clearFeeds();
    this.feeds = null;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  private createWindow(visible: boolean): void {
    if (this.window && !this.window.isDestroyed()) return;
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.bounds; // full bounds, so the dock is covered
    // The floor is the gap between the display bottom and the usable work area:
    // the macOS dock, the Windows taskbar, a Linux panel. The duck stands on it.
    const workArea = display.workArea;
    const bottomInset = Math.max(0, y + height - (workArea.y + workArea.height));

    const window = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: visible, // enabling while the app is focused hatches him hidden
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false, // never steal focus from whatever is being worked in
      alwaysOnTop: true,
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/pet.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window = window;

    // 'screen-saver' is the highest normal level — above the dock and above
    // other always-on-top windows.
    window.setAlwaysOnTop(true, 'screen-saver');
    // skipTransformProcessType, or this call transforms the whole app to
    // UIElementApplication so the duck can float over other apps' fullscreen
    // spaces — and an accessory app has no Dock tile and no menu bar.
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setIgnoreMouseEvents(true, { forward: true });

    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    if (rendererUrl) void window.loadURL(`${rendererUrl}/pet/index.html`);
    else void window.loadFile(join(import.meta.dirname, '../renderer/pet/index.html'));

    const sendLayout = (): void => {
      if (!this.window || this.window.isDestroyed()) return;
      queryDockRect((rect) => {
        if (!this.window || this.window.isDestroyed()) return;
        this.window.webContents.send('pet:config', {
          bottomInset,
          dock: dockConfig(rect, { x, y }),
        });
      });
    };
    window.webContents.once('did-finish-load', () => {
      this.sendPrefs();
      sendLayout();
    });

    // The cursor is polled rather than taken from forwarded DOM events: those
    // only fire while the pointer is over the window, which a click-through
    // window cannot rely on.
    const sendCursor = (): void => {
      if (!this.window || this.window.isDestroyed()) return;
      const point = screen.getCursorScreenPoint();
      this.window.webContents.send('pet:cursor', { x: point.x - x, y: point.y - y });
    };
    this.feeds = { layout: sendLayout, cursor: sendCursor };
    this.syncFeeds();

    window.on('closed', () => {
      this.clearFeeds();
      this.feeds = null;
      this.window = null;
    });
  }
}
