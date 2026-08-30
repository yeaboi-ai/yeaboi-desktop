// The renderer's whole path to the backend.
//
// The web app reached FastAPI three ways: Next rewrites for most /api/*
// paths, ~70 hand-written /api/*-proxy route handlers that attached a
// server-minted JWT, and /api/ws-token for client-side tokens. The desktop
// collapses all three: the main process mints the JWT (auth:get-token over
// the preload bridge), mapApiPath() translates the old proxy names to their
// real FastAPI paths, and apiFetch() prefixes the backend origin and attaches
// the same headers use-auth-fetch always sent.

import { logger } from '@/lib/logger';

export interface AuthInfo {
  token: string;
  apiUrl: string;
  wsUrl: string;
}

// Tokens are minted for 1h; re-ask well before that. Minting is a local HMAC
// in the main process — microseconds — so the cache exists only to keep
// apiFetch from an IPC round-trip per request.
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cached: { auth: AuthInfo; at: number } | null = null;

export async function getAuth(force = false): Promise<AuthInfo | null> {
  if (!force && cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.auth;
  const auth = await window.yeaboi.getAuthToken();
  if (!auth) return null; // identity is auto-minted at startup; null only on a malformed store
  cached = { auth, at: Date.now() };
  return auth;
}

/** Translate an old Next proxy path to the FastAPI path it proxied to.
 *  Non-proxy /api/* paths pass through — the Next rewrite was transparent. */
export function mapApiPath(url: string, method = 'GET'): string {
  if (!url.startsWith('/api/')) return url;
  const qIndex = url.indexOf('?');
  const path = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = qIndex === -1 ? '' : url.slice(qIndex + 1);
  const q = new URLSearchParams(query);
  const keepQuery = (p: string) => (query ? `${p}?${query}` : p);

  // Query-param proxies.
  if (path === '/api/board-proxy') return `/api/projects/${q.get('projectId')}/board`;
  if (path === '/api/global-board-proxy') return keepQuery('/api/board');
  if (path === '/api/analytics-proxy') {
    const endpoint = q.get('endpoint') ?? 'aggregate';
    const p = new URLSearchParams();
    const projectId = q.get('projectId');
    const sessionId = q.get('sessionId');
    if (projectId) p.set('project_id', projectId);
    if (sessionId) p.set('session_id', sessionId);
    const qs = p.toString();
    return `/api/analytics/${endpoint}${qs ? `?${qs}` : ''}`;
  }
  if (path === '/api/session-ai-calls-proxy') {
    const sessionId = q.get('sessionId') ?? '';
    const limit = q.get('limit');
    return `/api/analytics/session-ai-calls/${encodeURIComponent(sessionId)}${limit ? `?limit=${limit}` : ''}`;
  }
  if (path === '/api/feedback-proxy') {
    const id = q.get('id');
    if (id) return `/api/feedback/${id}`;
    return keepQuery('/api/feedback');
  }

  // Path-segment proxies.
  const seg = (re: RegExp) => path.match(re);
  let m: RegExpMatchArray | null;
  if ((m = seg(/^\/api\/cards-proxy\/(.+)$/))) return keepQuery(`/api/cards/${m[1]}`);
  if (path === '/api/cards-bulk-proxy') return '/api/cards-bulk';
  if (path === '/api/cards-search-proxy') return keepQuery('/api/cards/search');
  if ((m = seg(/^\/api\/card-views-proxy(\/.*)?$/)))
    return keepQuery(`/api/card-views${m[1] ?? ''}`);
  if ((m = seg(/^\/api\/card-attachments-proxy\/([^/]+)(\/.*)?$/)))
    return `/api/cards/${m[1]}/attachments${m[2] ?? ''}`;
  if ((m = seg(/^\/api\/card-links-proxy\/([^/]+)(\/.*)?$/)))
    return `/api/cards/${m[1]}/links${m[2] ?? ''}`;
  if ((m = seg(/^\/api\/agent-approve-proxy\/(.+)$/))) return `/api/cards/${m[1]}/agent/approve`;
  if ((m = seg(/^\/api\/sync-push-proxy\/(.+)$/))) return `/api/sync/cards/${m[1]}/push`;
  if ((m = seg(/^\/api\/sync-resolve-proxy\/(.+)$/))) return `/api/sync/links/${m[1]}/resolve`;
  if ((m = seg(/^\/api\/outputs-proxy\/([^/]+)$/))) return `/api/projects/${m[1]}/outputs`;
  if ((m = seg(/^\/api\/outputs-proxy\/([^/]+)\/([^/]+)$/))) {
    const base = `/api/projects/${m[1]}/outputs/${m[2]}`;
    return method.toUpperCase() === 'POST' ? `${base}/generate` : base;
  }
  if (path === '/api/team-proxy') return keepQuery('/api/team');
  if (path === '/api/settings-proxy') return keepQuery('/api/settings');
  return url;
}

function orgTeamHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('current_org_id') : null;
  const teamId = typeof window !== 'undefined' ? localStorage.getItem('current_team_id') : null;
  if (orgId) h['X-Org-Id'] = orgId;
  if (teamId) h['X-Team-Id'] = teamId;
  return h;
}

/**
 * Module-level authenticated fetch — the replacement for every plain
 * `fetch("/api/…")` that used to lean on a Next proxy for its auth. The
 * useAuthFetch hook delegates here too, adding its own 403 stale-org retry.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const auth = await getAuth();
  if (!auth) throw new Error('not signed in yet');
  const method = options.method ?? 'GET';
  const target = `${auth.apiUrl}${mapApiPath(url, method)}`;
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${auth.token}`,
    ...orgTeamHeaders(),
    ...(options.headers as Record<string, string>),
  };
  let response = await fetch(target, { ...options, headers });
  if (response.status === 401) {
    // The cached token aged out mid-flight — mint fresh and retry once.
    const fresh = await getAuth(true);
    if (fresh) {
      logger.warn('apiFetch: 401 — retrying with a fresh token', { url });
      headers['Authorization'] = `Bearer ${fresh.token}`;
      response = await fetch(target, { ...options, headers });
    }
  }
  return response;
}
