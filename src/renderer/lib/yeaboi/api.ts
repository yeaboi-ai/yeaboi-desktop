// Typed access to the backend through the preload bridge. The renderer never
// sees the loopback URL or the bearer token — window.yeaboi.api is a blind
// relay whose auth lives in the main process.

import { duckQuip } from '@/lib/duck-events';
import { runNotice } from './run-notices';

export interface Envelope<T = unknown> {
  ok: boolean;
  llm_mode: string;
  warnings: string[];
  data: T;
  error?: { type: string; message: string };
  hint?: string;
}

interface Bridge {
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
  onNavigate: (callback: (route: string) => void) => void;
  setPetEnabled: (enabled: boolean) => Promise<unknown>;
  appMeta: () => Promise<unknown>;
  onUpdateState: (callback: (state: unknown) => void) => void;
  getUpdateState: () => Promise<unknown>;
  checkForUpdate: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
  onAbout: (callback: () => void) => void;
  platform: string;
}

function bridge(): Bridge {
  const found = (window as unknown as { yeaboi?: Bridge }).yeaboi;
  if (!found) throw new Error('preload bridge missing — renderer loaded outside Electron?');
  return found;
}

export async function apiGet<T>(path: string): Promise<T> {
  const { status, body } = await bridge().api(path);
  if (status !== 200)
    throw new Error((body as { error?: string }).error ?? `GET ${path} → ${status}`);
  return body as T;
}

/** GET a route an older sidecar may not have: null on 404, throws on anything
 *  else. The only way to tell "not there yet" from a failure — apiGet folds
 *  the status into the message. */
export async function apiGetOptional<T>(path: string): Promise<T | null> {
  const { status, body } = await bridge().api(path);
  if (status === 404) return null;
  if (status !== 200)
    throw new Error((body as { error?: string }).error ?? `GET ${path} → ${status}`);
  return body as T;
}

export async function apiPost<T>(path: string, body: object = {}): Promise<T> {
  const { status, body: resp } = await bridge().api(path, { method: 'POST', body });
  if (status !== 200)
    throw new Error((resp as { error?: string }).error ?? `POST ${path} → ${status}`);
  return resp as T;
}

/** POST a request whose response is NDJSON, calling back once per parsed line.
 *
 *  Every mode run comes through here, so this is also where a finished run is
 *  announced — see run-notices.ts. Announcing it per-page would mean the same
 *  three lines in six of them, and one of them forgetting. */
export async function apiStream(
  path: string,
  body: object,
  onLine: (line: unknown) => void,
): Promise<void> {
  const { status, body: resp } = await bridge().apiStream(path, body, (line) => {
    const notice = runNotice(path, line);
    if (notice) duckQuip(notice.key, { route: notice.route });
    onLine(line);
  });
  if (status !== 200)
    throw new Error((resp as { error?: string }).error ?? `POST ${path} → ${status}`);
}

export async function callTool<T = unknown>(
  name: string,
  args: object = {},
  options: { opId?: string } = {},
): Promise<Envelope<T>> {
  const { status, body } = await bridge().api(`/api/tool/${name}`, {
    method: 'POST',
    body: { arguments: args, ...(options.opId ? { op_id: options.opId } : {}) },
  });
  if (status !== 200)
    throw new Error((body as { error?: string }).error ?? `tool ${name} → ${status}`);
  return body as Envelope<T>;
}

/** An op id ties a long tool call to the progress events it publishes on the
 *  ambient feed — filter onAmbientEvent for `type === 'progress'` with it. */
export function newOpId(): string {
  return `op-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function onBackendState(callback: (state: { kind: string; reason?: string }) => void): void {
  bridge().onBackendState((state) => callback(state as { kind: string; reason?: string }));
}

export function getBackendState(): Promise<{ kind: string; reason?: string }> {
  return bridge().getBackendState() as Promise<{ kind: string; reason?: string }>;
}

/** The ambient feed: consent requests and awareness notices, read once in main
 *  and pushed here. Not a second subscription — main owns the only one. */
export function onAmbientEvent(
  callback: (event: { type: string; [key: string]: unknown }) => void,
): void {
  bridge().onEvent((event) => callback(event as { type: string; [key: string]: unknown }));
}

/** Main asking the window to show a route — the tray, or a click on the duck. */
export function onNavigate(callback: (route: string) => void): void {
  bridge().onNavigate(callback);
}

/** The desktop pet's on/off. Main owns the window; the backend owns the choice. */
export function setPetEnabled(enabled: boolean): Promise<unknown> {
  return bridge().setPetEnabled(enabled);
}

/** 'darwin' | 'win32' | 'linux' — what the shortcut sheet names its modifier. */
export function platform(): string {
  return bridge().platform;
}

export interface VersionMeta {
  version: string;
  schema_version: number;
  python: string;
}

export const getVersion = (): Promise<VersionMeta> => apiGet<VersionMeta>('/api/meta/version');

/** The shell's own versions. Not a backend call — main is the only thing that
 *  knows what Electron build this is or whether the app is packaged. */
export interface ShellMeta {
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  arch: string;
  packaged: boolean;
}

export const getShellMeta = (): Promise<ShellMeta> => bridge().appMeta() as Promise<ShellMeta>;

export type { UpdateState } from '@shared/update';
import type { UpdateState } from '@shared/update';

export const getUpdateState = (): Promise<UpdateState> =>
  bridge().getUpdateState() as Promise<UpdateState>;
export const checkForUpdate = (): Promise<UpdateState> =>
  bridge().checkForUpdate() as Promise<UpdateState>;
export const downloadUpdate = (): Promise<UpdateState> =>
  bridge().downloadUpdate() as Promise<UpdateState>;
export const installUpdate = (): Promise<unknown> => bridge().installUpdate();

export function onUpdateState(callback: (state: UpdateState) => void): void {
  bridge().onUpdateState((state) => callback(state as UpdateState));
}

/** The tray asking for the About panel. */
export function onAbout(callback: () => void): void {
  bridge().onAbout(callback);
}
