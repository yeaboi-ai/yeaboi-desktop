// The board's HTTP client, replaced.
//
// yeaboi-frontend's `src/runtime/api.ts` reaches the board over `fetch` on its
// own origin, with the token and the admin secret lifted out of the URL. In the
// desktop neither of those is true: the board is not this page's origin, and
// the host secret lives in main and must stay there. Every request the board
// makes goes through this module (a Vite plugin points its imports here), so
// swapping it is the whole of the integration — the board's components,
// hooks and store are untouched.
//
// The signatures are the ones the board's own module exports. Anything it does
// not use is deliberately absent rather than stubbed.

interface Bridge {
  boardGet: (
    boardId: string,
    path: string,
    extra?: Record<string, string>,
    etag?: string,
  ) => Promise<{ status: number; body: unknown; etag?: string }>;
  boardPost: (
    boardId: string,
    path: string,
    body?: object,
  ) => Promise<{ status: number; body: unknown }>;
}

function bridge(): Bridge | null {
  const found = (window as unknown as { yeaboi?: Partial<Bridge> }).yeaboi;
  if (!found?.boardGet || !found.boardPost) return null;
  return found as Bridge;
}

/** Which board this page is playing. Set by the surface that mounts the board;
 *  the board itself never learns anything about it beyond what it renders. */
let playing = '';

export function playBoard(boardId: string): void {
  playing = boardId;
  primed = null;
}

/**
 * The first snapshot, fetched before the board is mounted.
 *
 * The board renders its shell from an empty store and fills it when the first
 * long-poll lands, which over a round trip is two arrivals: the room appears,
 * then everything in it animates in a second time. Read here first and handed
 * back to the board's own opening poll, the shell and its contents land
 * together.
 */
let primed: { path: string; data: unknown; etag: string } | null = null;

export async function primeBoard(boardId: string, pid: string): Promise<boolean> {
  const shell = bridge();
  if (!shell) return false;
  const answer = await shell.boardGet(boardId, '/api/state', { pid }, '');
  if (answer.status < 200 || answer.status >= 300) return false;
  primed = { path: '/api/state', data: answer.body, etag: answer.etag ?? '' };
  return true;
}

/** Whether a board can be played here at all — the shell has to be present to
 *  hold the host link. */
export function canPlayBoards(): boolean {
  return bridge() !== null;
}

export interface Session {
  token: string;
  admin: string;
  pid: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; data?: T };

export type PollResult<T> =
  | { changed: true; data: T; etag: string }
  | { changed: false; etag: string }
  | { changed: false; etag: string; error: true };

/**
 * The session, as the board understands it.
 *
 * `token` and `admin` are the board's way of saying "I may read" and "I am the
 * host". Here both are true by construction — main only relays for a board this
 * app is hosting — so they carry a marker rather than a secret. The board uses
 * them for what it *renders*; the server still checks the real ones, which are
 * added on the far side of the bridge.
 */
export function loadSession(_prefix: string, pid: string): Session {
  return { token: 'desktop', admin: 'desktop', pid };
}

/** Nothing to strip: no credential ever reached this page's address. */
export function stripCredentialsFromUrl(): void {}

/**
 * A URL for the board to put in an element's `src`.
 *
 * There is no such address here — the board is not an origin this page can
 * reach — so this returns the path unchanged and the few img-src uses (the
 * invite QR) simply do not load. The invite is on the poker surface, with the
 * code and the link, which is where a host reaches for it anyway.
 */
export function apiUrl(_session: Session, path: string): string {
  return path;
}

/**
 * The board's own `fetch`, routed through the bridge for as long as one is
 * staged.
 *
 * Almost everything a board asks for comes through this module, because the
 * build rewrites the boards' transport imports to it. One thing does not: the
 * invite panel calls `fetch(apiUrl(session, '/api/invite'))` directly, and
 * `apiUrl` has no address to give it — so the request went to this window's own
 * origin, came back as the app's own document with a 200, failed to parse, and
 * was swallowed by the panel's catch. It then asked again every few seconds,
 * for ever, saying "setting up the shared link" the whole time.
 *
 * Only the board's own paths, and only while a board is playing: the app itself
 * never fetches `/api/…` — its own calls go through the preload bridge.
 */
export function routeBoardFetch(): () => void {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const shell = bridge();
    const method = init?.method?.toUpperCase() ?? 'GET';
    if (!shell || !playing || method !== 'GET' || !url.startsWith('/api/')) {
      return real(input, init);
    }
    const [path = url, query = ''] = url.split('?');
    const answer = await shell.boardGet(
      playing,
      path,
      Object.fromEntries(new URLSearchParams(query)),
      '',
    );
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return () => {
    window.fetch = real;
  };
}

export async function postJSON<T>(
  session: Session,
  path: string,
  body: Record<string, unknown> = {},
): Promise<ApiResult<T>> {
  const shell = bridge();
  if (!shell || !playing) return { ok: false, status: 0 };
  const [base = path] = path.split('?');
  const answer = await shell.boardPost(playing, base, { pid: session.pid, ...body });
  if (answer.status < 200 || answer.status >= 300) {
    return { ok: false, status: answer.status, data: answer.body as T };
  }
  return { ok: true, data: answer.body as T };
}

export async function pollState<T>(
  session: Session,
  {
    etag = '',
    waitSeconds = 0,
    path = '/api/state',
  }: { etag?: string; waitSeconds?: number; signal?: AbortSignal; path?: string } = {},
): Promise<PollResult<T>> {
  // The opening poll — no ETag yet — is answered from what was read before the
  // board mounted, if that is what it is asking for. Once spent it is gone: a
  // reconnect asks the server.
  if (primed && primed.path === path && !etag) {
    const first = primed;
    primed = null;
    return { changed: true, data: first.data as T, etag: first.etag };
  }
  const shell = bridge();
  if (!shell || !playing) return { changed: false, etag, error: true };
  const extra: Record<string, string> = { pid: session.pid };
  if (waitSeconds > 0) extra['wait'] = String(waitSeconds);
  const answer = await shell.boardGet(playing, path, extra, etag);
  if (answer.status === 304) return { changed: false, etag: answer.etag || etag };
  if (answer.status < 200 || answer.status >= 300) {
    return { changed: false, etag, error: true };
  }
  return { changed: true, data: answer.body as T, etag: answer.etag ?? '' };
}
