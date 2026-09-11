// The rail: every world starts with Sessions and Board plus Settings,
// every href a registered route, the active rule table-driven over the
// arranged items, and nothing the old nineteen-row rail listed left
// unreachable (the About pages live in the menu bar and the "+").

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audiencesForRoute, AUDIENCES } from '../src/shared/audience';
import { RAIL_DEFAULTS, type RailItem } from '../src/shared/rail';
import {
  SESSIONS_HEADER_LINKS,
  HOME_FOOT_LINKS,
  SETTINGS_ITEM,
  activeRailRoute,
  sessionsHref,
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
  '/sessions',
  '/board',
  '/sessions/new/from-roadmap',
  '/team/analysis',
  '/team/standup',
  '/team/retro',
  '/team/poker',
  '/team/performance',
  '/team/reporting',
  '/team/ship',
  '/agents/usage',
  '/agents/advisor',
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
  it('draws Sessions and Board in every world', () => {
    for (const audience of AUDIENCES) {
      expect(RAIL_DEFAULTS[audience].map((i) => i.label)).toEqual(['Sessions', 'Board']);
    }
  });

  it('links only registered routes, Settings included', () => {
    for (const audience of AUDIENCES) {
      for (const entry of RAIL_DEFAULTS[audience]) {
        expect(REGISTERED, `${entry.route} is not in routes.json`).toContain(entry.route);
      }
    }
    expect(REGISTERED).toContain(SETTINGS_ITEM.href);
    const pageLinks = [...SESSIONS_HEADER_LINKS, ...HOME_FOOT_LINKS].map((link) => link.href);
    for (const href of pageLinks) {
      expect(REGISTERED, `${href} is not in routes.json`).toContain(href);
    }
  });

  it('gives every other way in one short fact for its row', () => {
    for (const link of SESSIONS_HEADER_LINKS) {
      expect(link.fact, `${link.label} has no fact`).toBeTruthy();
      expect(link.fact!.length).toBeLessThan(90);
      expect(link.fact!.endsWith('.')).toBe(true);
      expect(link.fact).not.toMatch(/[→←·]/);
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

  it('sends both worlds to the same sessions ledger', () => {
    expect(sessionsHref('team')).toBe('/sessions');
    expect(sessionsHref('solo')).toBe('/sessions');
    expect(RAIL_DEFAULTS.solo[0]!.route).toBe('/sessions');
  });

  it('orphans nothing the old rail listed', () => {
    const reachable = new Set<string>([
      '/home',
      SETTINGS_ITEM.href,
      ...AUDIENCES.flatMap((a) => RAIL_DEFAULTS[a].map((i) => i.route)),
      ...AUDIENCES.flatMap((a) => railCatalogue(a).map((entry) => entry.route)),
      ...SESSIONS_HEADER_LINKS.map((link: { href: string }) => link.href),
      ...HOME_FOOT_LINKS.map((link: { href: string }) => link.href),
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
  const cases: [string, string | null][] = [
    ['/home', '/home'],
    ['/', '/home'],
    ['/news', '/home'],
    ['/sessions', '/sessions'],
    ['/sessions/p1', '/sessions'],
    ['/sessions/p1/blueprint', '/sessions'],
    ['/sessions/new/from-roadmap', '/sessions'],
    ['/board', '/board'],
    ['/tickets/t1', '/sessions'],
    ['/team/standup', '/home'],
    ['/team/reporting/new', '/home'],
    ['/solo/review', '/home'],
    ['/ceremonies', '/home'],
    ['/ceremonies/slack', '/home'],
    ['/provenance', '/home'],
    ['/usage', '/home'],
    ['/recordings/r1', '/home'],
    ['/recording/tok', '/home'],
    ['/clip/tok', '/home'],
    ['/settings', '/settings'],
    ['/settings/credentials', '/settings'],
    ['/settings/themes/edit', '/settings'],
    ['/setup', '/settings'],
    ['/whats-new', null],
    ['/system-check', null],
    ['/privacy', null],
    ['/feedback', null],
  ];

  it.each(cases)('%s lights %s', (pathname, expected) => {
    expect(activeRailRoute(team, pathname, 'team')).toBe(expected);
  });

  it('lights the mascot on the agentwatch pages, as on every mode page', () => {
    const solo = RAIL_DEFAULTS.solo;
    expect(activeRailRoute(solo, '/agents/usage', 'solo')).toBe('/home');
    expect(activeRailRoute(solo, '/agents/security', 'solo')).toBe('/home');
  });

  it('matches whole segments, not raw prefixes', () => {
    expect(activeRailRoute(team, '/boardroom', 'team')).toBeNull();
    expect(activeRailRoute(team, '/teamx', 'team')).toBeNull();
    expect(activeRailRoute(team, '/settingsx', 'team')).toBeNull();
  });
});

describe('activeRailRoute over an arranged rail', () => {
  it('lights an item over the family it belongs to', () => {
    const items = [...RAIL_DEFAULTS.team, item('/team/standup')];
    expect(activeRailRoute(items, '/board', 'team')).toBe('/board');
    expect(activeRailRoute(items, '/team/standup/setup', 'team')).toBe('/team/standup');
    expect(activeRailRoute(items, '/team/retro', 'team')).toBe('/home');
  });

  it('prefers the longest match', () => {
    const items = [item('/team'), item('/team/standup')];
    expect(activeRailRoute(items, '/team/standup/setup', 'team')).toBe('/team/standup');
    expect(activeRailRoute(items, '/team/retro', 'team')).toBe('/team');
  });

  it('lights an About page only when it is on the rail', () => {
    expect(activeRailRoute([item('/whats-new')], '/whats-new', 'team')).toBe('/whats-new');
    expect(activeRailRoute(RAIL_DEFAULTS.team, '/whats-new', 'team')).toBeNull();
  });

  it('lights nothing but the foot on an empty rail', () => {
    expect(activeRailRoute([], '/sessions/p1', 'team')).toBeNull();
    expect(activeRailRoute([], '/team/standup', 'team')).toBe('/home');
    expect(activeRailRoute([], '/settings/duck', 'team')).toBe('/settings');
  });
});
