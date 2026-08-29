// Update policy — the Electron-free half of self-update, shared by main
// (updater.ts, tray.ts), the renderer (the sidebar card and What's New), and
// the tests. State transitions and electron-updater stay in src/main/updater.ts.

export type UpdateState =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'idle'; version?: string }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

/** Where an installed build can replace itself, and where it cannot.
 *
 *  A `.deb` is owned by the system package manager and an unpackaged dev run
 *  has nothing to update — saying so plainly beats a button that fails. */
export function updateSupport(
  packaged: boolean,
  platform: string,
  appImage: string | undefined,
): string | null {
  if (!packaged) return 'Updates are handled by your dev server while running from source.';
  if (platform === 'linux' && !appImage) {
    return 'Installed from a package — update through your package manager.';
  }
  return null;
}

/** The update item says where the update got to, not what the menu does — a
 *  "Check for updates…" that already found one reads as if nothing happened.
 *  The name is passed in rather than read here so this stays a pure function. */
export function updateLabel(state: UpdateState, name: string): string {
  switch (state.kind) {
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Download ${name} ${state.version}`;
    case 'downloading':
      return `Downloading ${state.version} — ${state.percent}%`;
    case 'ready':
      return `Restart to update to ${state.version}`;
    case 'error':
      return 'Check for updates… (last check failed)';
    case 'unsupported':
      return 'Updates are managed outside the app';
    default:
      return 'Check for updates…';
  }
}

/** First automatic check waits out the sidecar cold start and the window's
 *  first paint; later ones keep a long-running app aware of new releases. */
export const UPDATE_CHECK_DELAY_MS = 15_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Whether a scheduled check should run now. `available` re-checks so a newer
 *  release supersedes an unclicked older one; `error` lets the next tick retry
 *  an offline launch. A check in flight, a download, or a build that cannot
 *  update is left alone. */
export function shouldAutoCheck(kind: UpdateState['kind']): boolean {
  return kind === 'idle' || kind === 'available' || kind === 'error';
}

/** Whether the passive chrome (sidebar card, nav dot) should show. Background
 *  failures never produce chrome — errors surface only where a person acted. */
export function updateIndicatorVisible(
  state: UpdateState,
  dismissedVersion: string | null,
): boolean {
  if (state.kind === 'downloading' || state.kind === 'ready') return true;
  if (state.kind === 'available') return state.version !== dismissedVersion;
  return false;
}
