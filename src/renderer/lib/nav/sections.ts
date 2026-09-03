// The rail's inventory: in every world there are two ways to work — a Project
// or a Session — and one Settings row. Pure data, so the rail's membership and
// its active-row rule are testable in the node lane (test/nav-sections.test.ts).
//
// The hrefs are the manifest's paths verbatim (lib/yeaboi/routes.json) — the
// rail is a view over that registry, not a second list of truths.

import type { Audience } from '@shared/audience';

export type IconKey = 'projects' | 'sessions' | 'settings';

export interface NavItemSpec {
  href: string;
  label: string;
  icon: IconKey;
}

export type RailRow = 'projects' | 'sessions' | 'settings';

/** The projects list for a world: Agents scopes the same projects by repo. */
export function projectsHref(audience: Audience): string {
  return audience === 'agents' ? '/agents/projects' : '/projects';
}

/** The two rows the rail draws, in order. */
export function navItems(audience: Audience): NavItemSpec[] {
  return [
    { href: projectsHref(audience), label: 'Projects', icon: 'projects' },
    { href: '/sessions', label: 'Sessions', icon: 'sessions' },
  ];
}

export const SETTINGS_ITEM: NavItemSpec = {
  href: '/settings',
  label: 'Settings',
  icon: 'settings',
};

/** Reached from the Projects page header, and lit as Projects on the rail. */
export const PROJECTS_HEADER_LINKS: readonly string[] = ['/projects/new/from-roadmap', '/board'];

/** Reached from the foot of Sessions, and lit as Sessions on the rail. */
export const SESSIONS_FOOT_LINKS: readonly string[] = ['/ceremonies', '/provenance', '/usage'];

/** Routes the About group of Settings serves. */
export const ABOUT_ROUTES: readonly string[] = [
  '/whats-new',
  '/system-check',
  '/privacy',
  '/feedback',
];

const SETTINGS_PREFIXES = ['/settings', '/setup', ...ABOUT_ROUTES];
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

/** Which rail row a location lights, or null (the home). A mode page opened
 *  from inside a project carries `?project=`, and stays under Projects. */
export function activeRailRow(pathname: string, search = ''): RailRow | null {
  if (SETTINGS_PREFIXES.some((prefix) => matches(pathname, prefix))) return 'settings';
  if (new URLSearchParams(search).get('project')) return 'projects';
  if (PROJECTS_PREFIXES.some((prefix) => matches(pathname, prefix))) return 'projects';
  if (SESSIONS_PREFIXES.some((prefix) => matches(pathname, prefix))) return 'sessions';
  return null;
}
