// The packaged renderer's origin. Serving index.html from file:// gives the
// window an opaque "null" origin, which makes the backend's CORS story ugly
// and cookies/storage flaky. A privileged custom scheme gives every packaged
// install the same stable origin — app://yeaboi — which the planning backend
// lists in CORS_ORIGINS next to the dev server's http://localhost:5173.

import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { protocol } from 'electron';

export const APP_ORIGIN = 'app://yeaboi';

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
