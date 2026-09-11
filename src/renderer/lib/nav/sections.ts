// The rail's fixed parts and its active rule. The rail's items themselves are
// a preference (@shared/rail, one list per world); what stays here is the
// Settings foot, the links the home and the Sessions page carry, and which
// item a location lights. Pure, so the rule is testable in the node lane
// (test/nav-sections.test.ts).
//
// The hrefs are the manifest's paths verbatim (lib/yeaboi/routes.json) — the
// rail is a view over that registry, not a second list of truths.

import { sessionsHref, type Audience } from '@shared/audience';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';

export { sessionsHref };

export interface PageLink {
  href: string;
  label: string;
  /** One line saying what is behind the link, where a page lists it as a row. */
  fact?: string;
}

/** The rail's foot: the one row nobody arranges. */
export const SETTINGS_ITEM: PageLink = { href: '/settings', label: 'Settings' };

/** The other ways in, rows at the foot of the Sessions sheet; lit as Sessions on the rail. */
export const SESSIONS_HEADER_LINKS: readonly PageLink[] = [
  {
    href: '/sessions/new/from-roadmap',
    label: 'From a roadmap',
    fact: 'A Confluence or Notion roadmap page becomes a session.',
  },
  {
    href: '/board',
    label: 'All tickets',
    fact: 'Every open ticket across your sessions, on one board.',
  },
];

/** Reached from the foot of the home. */
export const HOME_FOOT_LINKS: readonly PageLink[] = [
  { href: '/ceremonies', label: 'Ceremonies' },
  { href: '/provenance', label: 'Provenance' },
  { href: '/usage', label: 'Spend' },
  { href: '/news', label: 'Front page' },
];

const SETTINGS_PREFIXES = ['/settings', '/setup'];
const SESSIONS_PREFIXES = ['/sessions', '/board', '/tickets'];
/** The mode pages and what the home's foot reaches: pages of the menu, so
 *  they light the mascot. */
const MODE_PREFIXES = [
  '/news',
  '/team',
  '/solo',
  '/agents',
  '/ceremonies',
  '/provenance',
  '/usage',
  '/recordings',
  '/recording',
  '/clip',
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function inFamily(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matches(pathname, prefix));
}

/**
 * The route of the rail item a location lights, `/settings` for the foot, the
 * home for the home itself and the mode pages (they are the menu's pages), or
 * null (a page no item and no family covers). In order: the settings family;
 * the item whose route is the longest whole-segment prefix of the location;
 * then the families, so a default rail still lights Sessions on a ticket and
 * the mascot on a standup.
 */
export function activeRailRoute(
  items: readonly { route: string }[],
  pathname: string,
  audience: Audience,
): string | null {
  if (inFamily(pathname, SETTINGS_PREFIXES)) return SETTINGS_ITEM.href;
  const has = (route: string) => items.some((item) => item.route === route);
  const sessions = sessionsHref(audience);

  let best: string | null = null;
  for (const item of items) {
    if (matches(pathname, item.route) && (best === null || item.route.length > best.length)) {
      best = item.route;
    }
  }
  if (best !== null) return best;

  if (inFamily(pathname, SESSIONS_PREFIXES) && has(sessions)) return sessions;
  if (pathname === '/' || pathname === DEFAULT_ROUTE) return DEFAULT_ROUTE;
  if (inFamily(pathname, MODE_PREFIXES)) return DEFAULT_ROUTE;
  return null;
}
