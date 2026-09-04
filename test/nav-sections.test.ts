// The rail: every world starts with Projects and Sessions plus Settings,
// every href a registered route, the active rule table-driven over the
// arranged items, and nothing the old nineteen-row rail listed left
// unreachable (the About pages live in the menu bar and the "+").

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audiencesForRoute, AUDIENCES } from '../src/shared/audience';
import { RAIL_DEFAULTS, type RailItem } from '../src/shared/rail';
import {
  PROJECTS_HEADER_LINKS,
  SESSIONS_FOOT_LINKS,
  SETTINGS_ITEM,
  activeRailRoute,
  projectsHref,
} from '../src/renderer/lib/nav/sections';
import { railCatalogue } from '../src/renderer/lib/nav/rail-catalogue';
import { MODE_ROUTES, MODE_START_ROUTES } from '../src/renderer/lib/yeaboi/tips';
import { menuPathnames } from '../src/shared/menu';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
) as { routes: { path: string }[] };
const REGISTERED = new Set(registry.routes.map((route) => route.path));

/** Everything the pre-diptych rail listed. Each must still be reachable from
 *  the rail (as it starts or as it can be arranged), a page header or foot,
 *  the menu bar, or a mode's route. */
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

const item = (route: string): RailItem => ({
  id: route.replace(/\W+/g, '-'),
  route,
  label: route,
  icon: { kind: 'lucide', name: 'Compass' },
});

describe('the rail as it starts', () => {
  it('draws Projects and Sessions in every world', () => {
    for (const audience of AUDIENCES) {
      expect(RAIL_DEFAULTS[audience].map((i) => i.label)).toEqual(['Projects', 'Sessions']);
    }
  });

  it('links only registered routes, Settings included', () => {
    for (const audience of AUDIENCES) {
      for (const entry of RAIL_DEFAULTS[audience]) {
        expect(REGISTERED, `${entry.route} is not in routes.json`).toContain(entry.route);
      }
    }
    expect(REGISTERED).toContain(SETTINGS_ITEM.href);
    const pageLinks = [...PROJECTS_HEADER_LINKS, ...SESSIONS_FOOT_LINKS].map((link) => link.href);
    for (const href of pageLinks) {
      expect(REGISTERED, `${href} is not in routes.json`).toContain(href);
    }
  });

  it('never places a row in the wrong world', () => {
    for (const audience of AUDIENCES) {
      for (const entry of RAIL_DEFAULTS[audience]) {
        const worlds = audiencesForRoute(entry.route);
        if (worlds.length > 0) {
          expect(worlds, `${entry.route} in the ${audience} rail`).toContain(audience);
        }
      }
    }
  });

  it('sends Agents to its own projects list and everyone else to the workspace', () => {
    expect(projectsHref('agents')).toBe('/agents/projects');
    expect(projectsHref('team')).toBe('/projects');
    expect(projectsHref('solo')).toBe('/projects');
    expect(RAIL_DEFAULTS.agents[0]!.route).toBe('/agents/projects');
  });

  it('orphans nothing the old rail listed', () => {
    const reachable = new Set<string>([
      '/home',
      SETTINGS_ITEM.href,
      ...AUDIENCES.flatMap((a) => RAIL_DEFAULTS[a].map((i) => i.route)),
      ...AUDIENCES.flatMap((a) => railCatalogue(a).map((entry) => entry.route)),
      ...PROJECTS_HEADER_LINKS.map((link) => link.href),
      ...SESSIONS_FOOT_LINKS.map((link) => link.href),
      ...AUDIENCES.flatMap((a) => menuPathnames(a)),
      ...Object.values(MODE_ROUTES),
      ...Object.values(MODE_START_ROUTES),
    ]);
    for (const href of OLD_INVENTORY) {
      expect(reachable, `${href} is reachable from nowhere`).toContain(href);
    }
  });
});

describe('activeRailRoute over the default rail', () => {
  const team = RAIL_DEFAULTS.team;
  const cases: [string, string, string | null][] = [
    ['/home', '', null],
    ['/', '', null],
    ['/projects', '', '/projects'],
    ['/projects/p1', '', '/projects'],
    ['/projects/p1/blueprint', '', '/projects'],
    ['/projects/new/from-roadmap', '', '/projects'],
    ['/board', '', '/projects'],
    ['/board', '?project=p1', '/projects'],
    ['/tickets/t1', '', '/projects'],
    ['/sessions', '', '/sessions'],
    ['/team/standup', '', '/sessions'],
    ['/team/reporting/new', '', '/sessions'],
    ['/solo/review', '', '/sessions'],
    ['/ceremonies', '', '/sessions'],
    ['/ceremonies/slack', '', '/sessions'],
    ['/provenance', '', '/sessions'],
    ['/usage', '', '/sessions'],
    ['/recordings/r1', '', '/sessions'],
    ['/recording/tok', '', '/sessions'],
    ['/clip/tok', '', '/sessions'],
    ['/settings', '', '/settings'],
    ['/settings/credentials', '', '/settings'],
    ['/settings/themes/edit', '', '/settings'],
    ['/setup', '', '/settings'],
    ['/whats-new', '', null],
    ['/system-check', '', null],
    ['/privacy', '', null],
    ['/feedback', '', null],
  ];

  it.each(cases)('%s%s lights %s', (pathname, search, expected) => {
    expect(activeRailRoute(team, pathname, search, 'team')).toBe(expected);
  });

  it('lights the agents projects list on its own pages', () => {
    const agents = RAIL_DEFAULTS.agents;
    expect(activeRailRoute(agents, '/agents/projects', '', 'agents')).toBe('/agents/projects');
    expect(activeRailRoute(agents, '/agents/projects/p1', '', 'agents')).toBe('/agents/projects');
    expect(activeRailRoute(agents, '/agents/usage', '', 'agents')).toBe('/sessions');
    expect(activeRailRoute(agents, '/agents/security', '', 'agents')).toBe('/sessions');
  });

  it('keeps a mode page opened inside a project under Projects', () => {
    expect(activeRailRoute(team, '/team/reporting/new', '?project=p1', 'team')).toBe('/projects');
    expect(activeRailRoute(team, '/team/standup', '?project=p1&run=3', 'team')).toBe('/projects');
    expect(activeRailRoute(RAIL_DEFAULTS.agents, '/agents/usage', '?project=p1', 'agents')).toBe(
      '/agents/projects',
    );
  });

  it('ignores an empty project param', () => {
    expect(activeRailRoute(team, '/team/standup', '?project=', 'team')).toBe('/sessions');
    expect(activeRailRoute(team, '/team/standup', '?run=3', 'team')).toBe('/sessions');
  });

  it('matches whole segments, not raw prefixes', () => {
    expect(activeRailRoute(team, '/boardroom', '', 'team')).toBeNull();
    expect(activeRailRoute(team, '/teamx', '', 'team')).toBeNull();
    expect(activeRailRoute(team, '/settingsx', '', 'team')).toBeNull();
  });
});

describe('activeRailRoute over an arranged rail', () => {
  it('lights an item over the family it belongs to', () => {
    const items = [...RAIL_DEFAULTS.team, item('/board'), item('/team/standup')];
    expect(activeRailRoute(items, '/board', '', 'team')).toBe('/board');
    expect(activeRailRoute(items, '/team/standup/setup', '', 'team')).toBe('/team/standup');
    expect(activeRailRoute(items, '/team/retro', '', 'team')).toBe('/sessions');
  });

  it('prefers the longest match', () => {
    const items = [item('/team'), item('/team/standup')];
    expect(activeRailRoute(items, '/team/standup/setup', '', 'team')).toBe('/team/standup');
    expect(activeRailRoute(items, '/team/retro', '', 'team')).toBe('/team');
  });

  it('keeps a project-scoped mode page under Projects even with the mode on the rail', () => {
    const items = [...RAIL_DEFAULTS.team, item('/team/standup')];
    expect(activeRailRoute(items, '/team/standup', '?project=p1', 'team')).toBe('/projects');
  });

  it('lights an About page only when it is on the rail', () => {
    expect(activeRailRoute([item('/whats-new')], '/whats-new', '', 'team')).toBe('/whats-new');
    expect(activeRailRoute(RAIL_DEFAULTS.team, '/whats-new', '', 'team')).toBeNull();
  });

  it('lights nothing but the foot on an empty rail', () => {
    expect(activeRailRoute([], '/projects/p1', '', 'team')).toBeNull();
    expect(activeRailRoute([], '/team/standup', '?project=p1', 'team')).toBeNull();
    expect(activeRailRoute([], '/settings/duck', '', 'team')).toBe('/settings');
  });
});
