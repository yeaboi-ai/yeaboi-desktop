// The music services' sign-in and library (contracts/v1/app_http.md, "Music").
//
// These routes answer a vendor's refusal as `{error, code}` with a status the
// code implies, and `signed_out` is a 409 on purpose — so the calls here keep
// the code instead of folding the status into a message the way apiGet does.
// A 404 is an older backend without the routes at all.

export interface LibraryItem {
  id: string;
  kind: 'track' | 'album' | 'playlist' | 'video' | 'song';
  title: string;
  subtitle: string;
  artwork_url: string;
  duration_ms: number;
  /** A share link the link grammar accepts: what a row plays through. */
  url: string;
  uri: string;
  preview_url: string;
  count: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  next_cursor: string;
}

export type MusicShelf = 'playlists' | 'liked' | 'albums' | 'recent';

export type MusicErrorCode =
  | 'signed_out'
  | 'premium_required'
  | 'no_active_device'
  | 'not_allowlisted'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'unsupported_shelf'
  | 'bad_uri'
  | 'unavailable'
  | 'older_backend'
  | 'bad_request'
  | 'unknown';

export class MusicApiError extends Error {
  constructor(
    message: string,
    public readonly code: MusicErrorCode,
    public readonly status: number,
    public readonly retryAfter = 0,
  ) {
    super(message);
    this.name = 'MusicApiError';
  }
}

const KNOWN: ReadonlySet<string> = new Set([
  'signed_out',
  'premium_required',
  'no_active_device',
  'not_allowlisted',
  'quota_exceeded',
  'rate_limited',
  'unsupported_shelf',
  'bad_uri',
  'unavailable',
]);

/** The error a non-200 answer means. Pure, so the mapping is testable. */
export function musicError(status: number, body: unknown, path = ''): MusicApiError {
  const data = (body && typeof body === 'object' ? body : {}) as {
    error?: string;
    code?: string;
    retry_after?: number;
  };
  const message = typeof data.error === 'string' && data.error ? data.error : `${path} → ${status}`;
  if (status === 404 && !data.code) {
    return new MusicApiError('This needs a newer yeaboi backend', 'older_backend', status);
  }
  const code: MusicErrorCode =
    data.code && KNOWN.has(data.code)
      ? (data.code as MusicErrorCode)
      : status === 400
        ? 'bad_request'
        : 'unknown';
  return new MusicApiError(message, code, status, Number(data.retry_after) || 0);
}

/** The codes the desktop answers by handing the track to the Spotify app. */
export function fallsBackToApp(error: unknown): boolean {
  return (
    error instanceof MusicApiError &&
    (error.code === 'premium_required' || error.code === 'no_active_device')
  );
}

interface Bridge {
  api: (
    path: string,
    init?: { method?: string; body?: unknown },
  ) => Promise<{ status: number; body: unknown }>;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const found = (window as unknown as { yeaboi?: Bridge }).yeaboi;
  if (!found) throw new Error('preload bridge missing — renderer loaded outside Electron?');
  const { status, body } = await found.api(path, init);
  if (status !== 200) throw musicError(status, body, path);
  return body as T;
}

const post = <T>(path: string, body: object = {}) => call<T>(path, { method: 'POST', body });

export interface SignInStart {
  started: boolean;
  url: string;
  message: string;
}

export interface SignInPoll {
  active: boolean;
  done?: boolean;
  ok?: boolean;
  saved?: boolean;
  account?: string;
  message?: string;
}

export const startSignIn = (key: string) => post<SignInStart>(`/api/connections/${key}/signin`);
export const signInStatus = (key: string) => call<SignInPoll>(`/api/connections/${key}/signin`);
export const cancelSignIn = (key: string) =>
  post<{ ok: boolean }>(`/api/connections/${key}/signin/cancel`);
export const signOut = (key: string) =>
  post<{ ok: boolean; signed_in: boolean }>(`/api/connections/${key}/signout`);

function query(params: Record<string, string | number>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== '' && v !== undefined);
  return pairs.length
    ? `?${new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString()}`
    : '';
}

export const libraryShelf = (key: string, shelf: MusicShelf, cursor = '', limit = 20) =>
  call<LibraryPage>(`/api/music/${key}/library${query({ shelf, cursor, limit })}`);
export const playlistItems = (key: string, playlistId: string, cursor = '', limit = 50) =>
  call<LibraryPage>(
    `/api/music/${key}/playlist/${encodeURIComponent(playlistId)}/items${query({ cursor, limit })}`,
  );
export const searchCatalogue = (key: string, q: string, limit = 20) =>
  call<LibraryPage>(`/api/music/${key}/search${query({ q, limit })}`);
export const spotifyPlay = (uri: string, deviceId = '') =>
  post<{ ok: boolean }>('/api/music/spotify/play', { uri, device_id: deviceId });
export interface SpotifyPlayer {
  playing: boolean;
  progress_ms: number;
  item: LibraryItem | null;
  device: { id: string; name: string } | null;
}
export const spotifyPlayer = () => call<SpotifyPlayer>('/api/music/spotify/player');
