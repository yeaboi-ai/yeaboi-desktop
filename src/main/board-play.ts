// The app playing a live board — the board's own front end, served from here.
//
// The board is a React app (yeaboi-frontend's `src/poker`), and the desktop
// renders it directly rather than pointing a window at the board's HTTP page.
// What it cannot have is the address: the host link carries the token *and* the
// admin secret, and it is served only to main (`api-proxy.ts`'s MAIN_ONLY). So
// the board's HTTP client is swapped for one that names a board and a path, and
// this relays it — the credentials go on here and never cross back.
//
// Paths are checked rather than passed through. `/api/…` on the board's own
// origin, nothing else, no matter what the renderer asks for.

import { ipcMain } from 'electron';

import type { Sidecar } from './sidecar';

/** What a board path may look like. The board's own routes and no others: no
 *  scheme, no host, no `..`, no query of the caller's choosing. */
const PATH = /^\/api\/[a-z0-9/_-]{0,60}$/i;

interface Host {
  base: string;
  token: string;
  admin: string;
}

/** Host links, by board — stable for the life of a board, and the round-trip
 *  would otherwise ride on every poll. */
const hosts = new Map<string, Host>();

export function forgetBoard(boardId: string): void {
  hosts.delete(boardId);
}

async function hostOf(sidecar: Sidecar, boardId: string): Promise<Host | null> {
  const known = hosts.get(boardId);
  if (known) return known;
  const handshake = sidecar.handshake;
  if (!handshake) return null;
  const response = await fetch(`${handshake.url}/api/boards/${boardId}/host`, {
    headers: { Authorization: `Bearer ${handshake.token}` },
  });
  if (!response.ok) return null;
  const { host_url: hostUrl } = (await response.json()) as { host_url: string };
  const url = new URL(hostUrl);
  const host: Host = {
    base: url.origin,
    token: url.searchParams.get('token') ?? '',
    admin: url.searchParams.get('admin') ?? '',
  };
  hosts.set(boardId, host);
  return host;
}

function board(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{1,32}$/.test(value) ? value : null;
}

function address(host: Host, path: string, extra: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  params.set('token', host.token);
  return `${host.base}${path}?${params.toString()}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export function registerBoardPlay(sidecar: Sidecar): void {
  /** A read, including the board's long-poll: the ETag is the cursor, so it
   *  travels in and out of here unchanged. */
  ipcMain.handle(
    'board-play:get',
    async (_event, boardId: unknown, path: unknown, extra: unknown, etag: unknown) => {
      const id = board(boardId);
      if (!id || typeof path !== 'string' || !PATH.test(path)) {
        return { status: 400, body: { error: 'not a board path' } };
      }
      const host = await hostOf(sidecar, id);
      if (!host) return { status: 503, body: { error: 'no live board' } };
      try {
        const response = await fetch(address(host, path, (extra ?? {}) as Record<string, string>), {
          cache: 'no-store',
          headers: typeof etag === 'string' && etag ? { 'If-None-Match': etag } : {},
        });
        return {
          status: response.status,
          etag: response.headers.get('ETag') ?? '',
          body: response.status === 304 ? {} : await readBody(response),
        };
      } catch (error) {
        return { status: 0, body: { error: (error as Error).message } };
      }
    },
  );

  /** A write. `pid` comes from the caller; `admin` is added here, which is the
   *  whole reason the host secret can stay in this process. */
  ipcMain.handle(
    'board-play:post',
    async (_event, boardId: unknown, path: unknown, body: unknown) => {
      const id = board(boardId);
      if (!id || typeof path !== 'string' || !PATH.test(path)) {
        return { status: 400, body: { error: 'not a board path' } };
      }
      const host = await hostOf(sidecar, id);
      if (!host) return { status: 503, body: { error: 'no live board' } };
      try {
        const response = await fetch(address(host, path, {}), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(body as object), admin: host.admin, token: host.token }),
        });
        return { status: response.status, body: await readBody(response) };
      } catch (error) {
        return { status: 0, body: { error: (error as Error).message } };
      }
    },
  );
}
