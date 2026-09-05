// The desktop route registry — the renderer half of the surface-parity seam.
//
// routes.json is the single source: this module types it for the router, and
// scripts/gen-routes-manifest.mjs code-generates it into
// contracts/v1/routes_manifest.json (committed), which yeaboi.ai's
// tests/unit/test_surface_parity.py::TestDesktop checks two-way against the
// CAPABILITIES desktop column. Add a page here → regenerate the manifest →
// register the capability, or the build fails on one side or the other.
//
// Planning-platform routes carry `capability: null` ("pure chrome" to the
// yeaboi registry) — the parity comparison skips null-capability entries, so
// the superset passes without a yeaboi.ai change.

import registry from './routes.json';

export interface AppRoute {
  path: string;
  /** The CAPABILITIES key this page implements, or null for pure chrome. */
  capability: string | null;
  title: string;
}

export const APP_ROUTES: readonly AppRoute[] = registry.routes;

export const DEFAULT_ROUTE = '/home';

export function routeFor(path: string): AppRoute | undefined {
  return APP_ROUTES.find((route) => route.path === path);
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const want = pattern.split('/');
  const have = pathname.split('/');
  if (want.length !== have.length) return false;
  return want.every((segment, i) => segment.startsWith(':') || segment === have[i]);
}

/** The page's name for the window title: the registry title before any
 *  section suffix ("Settings · Credentials" reads "Settings"); a dynamic
 *  route matches by segment; anything unregistered is the app. */
export function pageTitle(pathname: string): string {
  const route = routeFor(pathname) ?? APP_ROUTES.find((r) => matchesPattern(r.path, pathname));
  return route?.title.split(' · ')[0] ?? 'yeaboi';
}
