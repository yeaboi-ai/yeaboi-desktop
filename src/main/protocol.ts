// Serves the packaged renderer over a privileged custom scheme. The origin
// itself lives in src/shared/csp.ts, beside the dev-server origins and ports it
// has to agree with — planningEnv() builds the backend's CORS_ORIGINS from the
// same place — and is re-exported here so the scheme and its origin still read
// as one module.

import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { protocol } from 'electron';
import { APP_ORIGIN } from '../shared/csp';

export { APP_ORIGIN };

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/** Must run before app.whenReady(). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

/** Must run after app.whenReady(). Serves the built renderer directory. */
export function installAppScheme(rendererDir: string): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'yeaboi') return new Response('not found', { status: 404 });
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' || pathname === '' ? 'index.html' : pathname.slice(1);
    const file = normalize(join(rendererDir, relative));
    // No path escapes: everything served must live under the renderer build.
    if (!file.startsWith(normalize(rendererDir))) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      const body = await readFile(file);
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      return new Response(new Uint8Array(body), { headers: { 'Content-Type': type } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}
