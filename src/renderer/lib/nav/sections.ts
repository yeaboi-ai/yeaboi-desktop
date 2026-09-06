// The rail's fixed parts and its active rule. The rail's items themselves are
// a preference (@shared/rail, one list per world); what stays here is the
// Settings foot, the links the Projects and Sessions pages carry, and which
// item a location lights. Pure, so the rule is testable in the node lane
// (test/nav-sections.test.ts).
//
// The hrefs are the manifest's paths verbatim (lib/yeaboi/routes.json) — the
// rail is a view over that registry, not a second list of truths.

import { projectsHref, type Audience } from '@shared/audience';

export { projectsHref };

export interface PageLink {
  href: string;
  label: string;
  /** One line saying what is behind the link, where a page lists it as a row. */
  fact?: string;
}

/** The rail's foot: the one row nobody arranges. */
export const SETTINGS_ITEM: PageLink = { href: '/settings', label: 'Settings' };

/** The other ways into a project, rows at the foot of the Projects sheet; lit as Projects on the rail. */
export const PROJECTS_HEADER_LINKS: readonly PageLink[] = [
  {
    href: '/projects/new/from-roadmap',
    label: 'From a roadmap',
    fact: 'A Confluence or Notion roadmap page becomes a project.',
  },
  {
    href: '/board',
    label: 'All tickets',
    fact: 'Every open ticket across your projects, on one board.',
  },
];

/** Reached from the foot of Sessions, and lit as Sessions on the rail. */
export const SESSIONS_FOOT_LINKS: readonly PageLink[] = [
  { href: '/ceremonies', label: 'Ceremonies' },
  { href: '/provenance', label: 'Provenance' },
  { href: '/usage', label: 'Spend' },
];

const SETTINGS_PREFIXES = ['/settings', '/setup'];
const PROJECTS_PREFIXES = ['/projects', '/board', '/tickets', '/agents/projects'];
const SESSIONS_PREFIXES = [
  '/sessions',
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
 * The route of the rail item a location lights, `/settings` for the foot, or
 * null (the home, and a page no item and no family covers). In order: the
 * settings family; a mode page opened inside a project (`?project=`), which
 * stays under the projects item; the item whose route is the longest
 * whole-segment prefix of the location; then the doors' families, so a
 * default rail still lights Projects on a ticket and Sessions on a standup.
 */
export function activeRailRoute(
  items: readonly { route: string }[],
  pathname: string,
  search = '',
  audience: Audience,
): string | null {
  if (inFamily(pathname, SETTINGS_PREFIXES)) return SETTINGS_ITEM.href;
  const has = (route: string) => items.some((item) => item.route === route);
  const projects = projectsHref(audience);
  if (new URLSearchParams(search).get('project') && has(projects)) return projects;

  let best: string | null = null;
  for (const item of items) {
    if (matches(pathname, item.route) && (best === null || item.route.length > best.length)) {
      best = item.route;
    }
  }
  if (best !== null) return best;

  if (inFamily(pathname, PROJECTS_PREFIXES) && has(projects)) return projects;
  if (inFamily(pathname, SESSIONS_PREFIXES) && has('/sessions')) return '/sessions';
  return null;
}
