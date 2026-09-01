// The per-world sidebar inventory: every href is a registered route, no item
// sits in the wrong world, and splitting the nav orphaned nothing.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audiencesForRoute, AUDIENCES } from '../src/shared/audience';
import { navItems, navSections } from '../src/renderer/lib/nav/sections';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
) as { routes: { path: string }[] };
const REGISTERED = new Set(registry.routes.map((route) => route.path));

/** Everything the one-nav sidebar listed before the audience split, plus the
 *  one route the split added: the Solo world's own Weekly Review. */
const FULL_INVENTORY = [
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

describe('navSections', () => {
  it('links only registered routes', () => {
    for (const audience of AUDIENCES) {
      for (const item of navItems(audience)) {
        expect(REGISTERED, `${item.href} is not in routes.json`).toContain(item.href);
      }
    }
  });

  it('never places an item in the wrong world', () => {
    for (const audience of AUDIENCES) {
      for (const item of navItems(audience)) {
        const worlds = audiencesForRoute(item.href);
        if (worlds.length > 0) {
          expect(worlds, `${item.href} in the ${audience} nav`).toContain(audience);
        }
      }
    }
  });

  it('offers solo none of the modes that need a room', () => {
    const hrefs = navItems('solo').map((item) => item.href);
    for (const teamOnly of ['/team/retro', '/team/poker', '/team/performance']) {
      expect(hrefs).not.toContain(teamOnly);
    }
  });

  it('offers the weekly review to solo alone', () => {
    expect(navItems('solo').map((item) => item.href)).toContain('/solo/review');
    for (const audience of ['team', 'agents'] as const) {
      for (const item of navItems(audience)) {
        expect(item.href.startsWith('/solo/'), `${item.href} in the ${audience} nav`).toBe(false);
      }
    }
  });

  it('orphans nothing: the worlds together cover the old inventory', () => {
    const union = new Set(AUDIENCES.flatMap((audience) => navItems(audience).map((i) => i.href)));
    expect([...union].sort()).toEqual([...new Set(FULL_INVENTORY)].sort());
  });

  it('every world opens on Home', () => {
    for (const audience of AUDIENCES) {
      expect(navSections(audience)[0]!.items.map((i) => i.href)).toContain('/home');
    }
  });

  it('labels every section it draws', () => {
    for (const audience of AUDIENCES) {
      for (const section of navSections(audience).slice(1)) {
        expect(section.label).toBeTruthy();
        expect(section.items.length).toBeGreaterThan(0);
      }
    }
  });
});
