// The rail: two rows per world plus Settings, every href a registered route,
// the active-row rule table-driven, and nothing the old nineteen-row rail
// listed left unreachable.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audiencesForRoute, AUDIENCES } from '../src/shared/audience';
import {
  ABOUT_ROUTES,
  PROJECTS_HEADER_LINKS,
  SESSIONS_FOOT_LINKS,
  SETTINGS_ITEM,
  activeRailRow,
  navItems,
  projectsHref,
} from '../src/renderer/lib/nav/sections';
import { MODE_ROUTES, MODE_START_ROUTES } from '../src/renderer/lib/yeaboi/tips';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
) as { routes: { path: string }[] };
const REGISTERED = new Set(registry.routes.map((route) => route.path));

/** Everything the pre-diptych rail listed. Each must still be reachable from
 *  the rail, a page header or foot, the About group, or a mode's route. */
const OLD_INVENTORY = [
  '/solo/review',
  '/home',
  '/projects',
  '/board',
  '/projects/new/from-roadmap',
  '/team/analysis',
  '/team/standup',
  '/team/retro',
  '/team/poker',
  '/team/performance',
  '/team/reporting',
  '/team/ship',
  '/agents/usage',
  '/agents/advisor',
  '/agents/standup',
  '/agents/security',
  '/ceremonies',
  '/provenance',
  '/usage',
  '/whats-new',
  '/system-check',
  '/privacy',
  '/feedback',
];

describe('navItems', () => {
  it('draws exactly Projects and Sessions in every world', () => {
    for (const audience of AUDIENCES) {
      expect(navItems(audience).map((i) => i.label)).toEqual(['Projects', 'Sessions']);
    }
  });

  it('links only registered routes, Settings included', () => {
    for (const audience of AUDIENCES) {
      for (const item of [...navItems(audience), SETTINGS_ITEM]) {
        expect(REGISTERED, `${item.href} is not in routes.json`).toContain(item.href);
      }
    }
    const pageLinks = [...PROJECTS_HEADER_LINKS, ...SESSIONS_FOOT_LINKS].map((link) => link.href);
    for (const href of [...pageLinks, ...ABOUT_ROUTES]) {
      expect(REGISTERED, `${href} is not in routes.json`).toContain(href);
    }
  });

  it('never places a row in the wrong world', () => {
    for (const audience of AUDIENCES) {
      for (const item of navItems(audience)) {
        const worlds = audiencesForRoute(item.href);
        if (worlds.length > 0) {
          expect(worlds, `${item.href} in the ${audience} nav`).toContain(audience);
        }
      }
    }
  });

  it('sends Agents to its own projects list and everyone else to the workspace', () => {
    expect(projectsHref('agents')).toBe('/agents/projects');
    expect(projectsHref('team')).toBe('/projects');
    expect(projectsHref('solo')).toBe('/projects');
    expect(navItems('agents')[0]!.href).toBe('/agents/projects');
  });

  it('orphans nothing the old rail listed', () => {
    const reachable = new Set<string>([
      '/home',
      SETTINGS_ITEM.href,
      ...AUDIENCES.flatMap((a) => navItems(a).map((i) => i.href)),
      ...PROJECTS_HEADER_LINKS.map((link) => link.href),
      ...SESSIONS_FOOT_LINKS.map((link) => link.href),
      ...ABOUT_ROUTES,
      ...Object.values(MODE_ROUTES),
      ...Object.values(MODE_START_ROUTES),
    ]);
    for (const href of OLD_INVENTORY) {
      expect(reachable, `${href} is reachable from nowhere`).toContain(href);
    }
  });
});

describe('activeRailRow', () => {
  const cases: [string, string, ReturnType<typeof activeRailRow>][] = [
    ['/home', '', null],
    ['/', '', null],
    ['/projects', '', 'projects'],
    ['/projects/p1', '', 'projects'],
    ['/projects/p1/blueprint', '', 'projects'],
    ['/projects/new/from-roadmap', '', 'projects'],
    ['/board', '', 'projects'],
    ['/board', '?project=p1', 'projects'],
    ['/tickets/t1', '', 'projects'],
    ['/agents/projects', '', 'projects'],
    ['/agents/projects/p1', '', 'projects'],
    ['/sessions', '', 'sessions'],
    ['/team/standup', '', 'sessions'],
    ['/team/reporting/new', '', 'sessions'],
    ['/solo/review', '', 'sessions'],
    ['/agents/usage', '', 'sessions'],
    ['/agents/security', '', 'sessions'],
    ['/ceremonies', '', 'sessions'],
    ['/ceremonies/slack', '', 'sessions'],
    ['/provenance', '', 'sessions'],
    ['/usage', '', 'sessions'],
    ['/recordings/r1', '', 'sessions'],
    ['/recording/tok', '', 'sessions'],
    ['/clip/tok', '', 'sessions'],
    ['/settings', '', 'settings'],
    ['/settings/credentials', '', 'settings'],
    ['/settings/themes/edit', '', 'settings'],
    ['/setup', '', 'settings'],
    ['/whats-new', '', 'settings'],
    ['/system-check', '', 'settings'],
    ['/privacy', '', 'settings'],
    ['/feedback', '', 'settings'],
  ];

  it.each(cases)('%s%s lights %s', (pathname, search, expected) => {
    expect(activeRailRow(pathname, search)).toBe(expected);
  });

  it('keeps a mode page opened inside a project under Projects', () => {
    expect(activeRailRow('/team/reporting/new', '?project=p1')).toBe('projects');
    expect(activeRailRow('/team/standup', '?project=p1&run=3')).toBe('projects');
    expect(activeRailRow('/agents/usage', '?project=p1')).toBe('projects');
  });

  it('ignores an empty project param', () => {
    expect(activeRailRow('/team/standup', '?project=')).toBe('sessions');
    expect(activeRailRow('/team/standup', '?run=3')).toBe('sessions');
  });

  it('matches whole segments, not raw prefixes', () => {
    expect(activeRailRow('/boardroom', '')).toBeNull();
    expect(activeRailRow('/teamx', '')).toBeNull();
    expect(activeRailRow('/settingsx', '')).toBeNull();
  });
});
