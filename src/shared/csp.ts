/**
 * The renderer's Content-Security-Policy, built from the ports it will use.
 *
 * Generated rather than hand-written because the hardcoded version drifted from
 * the code twice over: the wide policy was on a `<meta name="viewport">` tag and
 * so was inert, and the tag that WAS live named only :8000 — blocking both the
 * :8001..:8010 the planning sidecar has always probed and the ws://…:7880
 * LiveKit has always used. One function, two callers, no way to drift again.
 *
 * A CSP delivered by meta tag is intersected with any other, so this REPLACES
 * the tags in index.html rather than sitting beside them.
 */

import { EMBED_FRAME_ORIGINS, RADIO_MEDIA_ORIGINS } from './music';

/**
 * The ports this worktree's sidecar may take. In the main checkout the variable
 * is unset and this is the 8000..8010 it has always been. The renderer's CSP is
 * generated from the same function (src/shared/csp.ts), so the two cannot drift
 * the way the hardcoded list and the hardcoded meta tag did.
 */
export function planningPortRange(): number[] {
  const base = Number(process.env['YEABOI_PLANNING_PORT']);
  const count = Number(process.env['YEABOI_PLANNING_PORT_COUNT']) || 5;
  if (Number.isInteger(base) && base > 0 && base < 65536) {
    return Array.from({ length: count }, (_unused, index) => base + index);
  }
  return [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];
}

/** LiveKit is machine-wide and deliberately shared between worktrees. */
export const LIVEKIT_PORT = 7880;

/** The packaged renderer's origin. Serving index.html from file:// gives the
 *  window an opaque "null" origin, which makes the backend's CORS story ugly
 *  and cookies/storage flaky; a privileged custom scheme gives every packaged
 *  install the same stable one. src/main/protocol.ts re-exports it. */
export const APP_ORIGIN = 'app://yeaboi';

/** CORS_ORIGINS accepts a comma list or a JSON array; read both. */
function parseOrigins(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not JSON after all — fall through to the comma form */
    }
  }
  return value.split(',');
}

/** The origins the renderer calls the backend from: the packaged scheme, plus
 *  whatever port electron-vite bound in dev. Main is the only process that
 *  knows the dev one — the backend's local-mode allowance is hardcoded to
 *  :5173, which a worktree's port block never matches. */
export function rendererOrigins(devUrl?: string): string[] {
  const origins_ = [APP_ORIGIN];
  if (devUrl) {
    try {
      origins_.push(new URL(devUrl).origin);
    } catch {
      /* a malformed dev URL must not stop the backend starting */
    }
  }
  return origins_;
}

/** The inherited CORS list plus the origins the renderer will actually use. */
export function corsOrigins(inherited?: string, devUrl?: string): string {
  const all = [...parseOrigins(inherited ?? ''), ...rendererOrigins(devUrl)]
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set(all)].join(',');
}

function origins(port: number, schemes: readonly string[]): string[] {
  return schemes.flatMap((scheme) => [
    `${scheme}://localhost:${port}`,
    `${scheme}://127.0.0.1:${port}`,
  ]);
}

export function rendererCsp(opts: {
  planningPorts: readonly number[];
  livekitPort?: number;
}): string {
  const livekit = opts.livekitPort ?? LIVEKIT_PORT;
  const http = opts.planningPorts.flatMap((port) => origins(port, ['http']));
  const connect = [
    ...opts.planningPorts.flatMap((port) => origins(port, ['http', 'ws'])),
    ...origins(livekit, ['ws', 'wss']),
  ];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${http.join(' ')}`,
    "font-src 'self'",
    `connect-src 'self' ${connect.join(' ')}`,
    // The radio stations by host, never `https:` wholesale — a station that
    // moves fails as the player's own error rather than opening every host.
    `media-src 'self' blob: https://cdn.replica.tavus.io https://storage.googleapis.com/eleven-public-prod/ ${RADIO_MEDIA_ORIGINS.join(' ')}`,
    "worker-src 'self' blob:",
    // Only the three embed players; without this line frame-src falls back
    // to default-src and no third-party frame loads at all.
    `frame-src ${EMBED_FRAME_ORIGINS.join(' ')}`,
  ].join('; ');
}
