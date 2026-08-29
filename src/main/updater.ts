// Self-update, over the GitHub Releases the desktop-release workflow publishes.
//
// This is the desktop's answer to the terminal's Ctrl+U, which pip-installs and
// relaunches itself. A signed app cannot do that: the bundled Python is inside
// a signed bundle, so replacing files under it breaks the signature. The whole
// application is replaced instead, by electron-updater, and the backend comes
// back with it.
//
// Nothing here downloads on its own. A person asks, from the About panel or the
// tray, and only then does the download start — an app that swaps itself out
// mid-sentence is not a feature.

import { app } from 'electron';
import { updateSupport, type UpdateState } from '../shared/update';

export type { UpdateState };

/** The one shape the renderer and the tray both read. */
export interface UpdaterLike {
  current: UpdateState;
  onState(listener: (state: UpdateState) => void): void;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): void;
}

export class Updater implements UpdaterLike {
  private state: UpdateState;
  private listeners = new Set<(state: UpdateState) => void>();
  private updater: import('electron-updater').AppUpdater | null = null;

  constructor(
    packaged = app.isPackaged,
    platform = process.platform,
    appImage = process.env['APPIMAGE'],
  ) {
    const unsupported = updateSupport(packaged, platform, appImage);
    this.state = unsupported ? { kind: 'unsupported', reason: unsupported } : { kind: 'idle' };
  }

  get current(): UpdateState {
    return this.state;
  }

  onState(listener: (state: UpdateState) => void): void {
    this.listeners.add(listener);
    listener(this.state);
  }

  private set(state: UpdateState): UpdateState {
    this.state = state;
    for (const listener of this.listeners) listener(state);
    return state;
  }

  /** electron-updater is loaded lazily: importing it in a dev run reaches for
   *  an app-update.yml that only a packaged build has. */
  private async engine(): Promise<import('electron-updater').AppUpdater> {
    if (this.updater) return this.updater;
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('download-progress', (progress) => {
      const version =
        this.state.kind === 'idle' ? '' : ((this.state as { version?: string }).version ?? '');
      this.set({ kind: 'downloading', version, percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ kind: 'ready', version: info.version }),
    );
    autoUpdater.on('error', (error) => this.set({ kind: 'error', message: error.message }));
    this.updater = autoUpdater;
    return autoUpdater;
  }

  async check(): Promise<UpdateState> {
    if (this.state.kind === 'unsupported') return this.state;
    this.set({ kind: 'checking' });
    try {
      const result = await (await this.engine()).checkForUpdates();
      const version = result?.updateInfo.version ?? app.getVersion();
      return this.set(
        version && version !== app.getVersion() ? { kind: 'available', version } : { kind: 'idle' },
      );
    } catch (error) {
      return this.set({ kind: 'error', message: (error as Error).message });
    }
  }

  async download(): Promise<UpdateState> {
    if (this.state.kind !== 'available') return this.state;
    const version = this.state.version;
    this.set({ kind: 'downloading', version, percent: 0 });
    try {
      await (await this.engine()).downloadUpdate();
      return this.state; // 'update-downloaded' has set it to ready by now.
    } catch (error) {
      return this.set({ kind: 'error', message: (error as Error).message });
    }
  }

  install(): void {
    if (this.state.kind !== 'ready') return;
    this.updater?.quitAndInstall();
  }
}
