// Playing a live board from inside the app.
//
// The table itself is drawn by the app, in the app's own hand — but the game is
// the board server's: it owns the round, the votes and the reveal, and every
// participant's browser is talking to the same state machine. So the app plays
// by calling that server, and this is the only place that can: the host link
// carries the token *and* the admin secret, and it is served only to main
// (`api-proxy.ts`'s MAIN_ONLY). The renderer names a board and an action.
//
// The actions are an allowlist rather than a path pass-through. A relay that
// forwards whatever it is handed is the admin secret with extra steps.

import { ipcMain } from 'electron';

import type { Sidecar } from './sidecar';

/** What the app may ask a board to do. `admin/*` is the host's own hand — the
 *  app is the host, which is why they are here at all. */
const ACTIONS = new Set([
  'presence',
  'vote',
  'vote/clear',
  'admin/reveal',
  'admin/revote',
  'admin/goto',
  'admin/finalize',
]);

interface Host {
  base: string;
  token: string;
  admin: string;
}

/** Host links, by board. Fetched once per board and dropped when the board
 *  ends — the link is stable for the life of a board, and the round-trip is on
 *  every poll otherwise. */
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

/** The app's own seat at the table. Stable for the process, so the board sees
 *  one participant rather than a new one per request. */
const PID = `desktop-${Math.random().toString(36).slice(2, 10)}`;

export function registerBoardPlay(sidecar: Sidecar): void {
  const address = (host: Host, path: string) =>
    `${host.base}${path}?token=${encodeURIComponent(host.token)}&admin=${encodeURIComponent(host.admin)}&pid=${encodeURIComponent(PID)}`;

  ipcMain.handle('board-play:state', async (_event, boardId: unknown) => {
    if (typeof boardId !== 'string' || !/^[a-f0-9]{1,32}$/.test(boardId)) {
      return { ok: false, error: 'invalid board id' };
    }
    const host = await hostOf(sidecar, boardId);
    if (!host) return { ok: false, error: 'no live board' };
    try {
      const response = await fetch(address(host, '/api/state'));
      if (!response.ok) return { ok: false, error: `board said ${response.status}` };
      return { ok: true, state: await response.json() };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'board-play:act',
    async (_event, boardId: unknown, action: unknown, payload: unknown) => {
      if (typeof boardId !== 'string' || !/^[a-f0-9]{1,32}$/.test(boardId)) {
        return { ok: false, error: 'invalid board id' };
      }
      if (typeof action !== 'string' || !ACTIONS.has(action)) {
        return { ok: false, error: 'not an action this app may take' };
      }
      const host = await hostOf(sidecar, boardId);
      if (!host) return { ok: false, error: 'no live board' };
      const body = { ...(payload as object), pid: PID, admin: host.admin, token: host.token };
      try {
        const response = await fetch(address(host, `/api/${action}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const answer = (await response.json()) as { state?: unknown; error?: string };
        if (!response.ok)
          return { ok: false, error: answer.error ?? `board said ${response.status}` };
        return { ok: true, state: answer.state };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  );
}
