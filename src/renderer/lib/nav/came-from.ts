// Where you were before you stepped aside.
//
// Settings, feedback, what's new and the system check are all somewhere you go
// and come back from — none of them is a mode, and none has a nav of its own to
// leave by. The rail and the dock both offer the way back, so the memory of
// where that is lives here rather than in either of them.

import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { isSettingsPath } from './rail-rows';

/** The pages that are a detour rather than a destination. Registered routes
 *  with no row in any world's rail: they open from a tile, a button, or the
 *  drawer, and the only thing to do at the end of one is leave. */
const ASIDE = new Set(['/ceremonies', '/usage', '/whats-new', '/system-check', '/feedback']);

export function isAsidePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return [...ASIDE].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Somewhere you would want to be returned to. */
function ordinary(pathname: string): boolean {
  return !isSettingsPath(pathname) && !isAsidePath(pathname);
}

let last = DEFAULT_ROUTE;

/** Called on every route change, from one place. */
export function rememberRoute(pathname: string | null | undefined): void {
  if (pathname && ordinary(pathname)) last = pathname;
}

export function cameFrom(): string {
  return last;
}
