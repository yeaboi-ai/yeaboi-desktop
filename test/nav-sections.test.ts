// The per-world sidebar inventory: every href is a registered route, no item
// sits in the wrong world, and splitting the nav orphaned nothing.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audiencesForRoute, AUDIENCES } from '../src/shared/audience';
import {
  navItems,
  navSections,
  OPS_ELSEWHERE,
  opsSection,
  railSections,
} from '../src/renderer/lib/nav/sections';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
) as { routes: { path: string }[] };
const REGISTERED = new Set(registry.routes.map((route) => route.path));

/** Routes the sidebar deliberately stopped listing. They are still registered
 *  and still reachable — Niko navigates to them, and so does a deep link — the
 *  nav simply no longer carries a door to them. */
const UNLISTED = ['/projects', '/board'];

/** Everything the one-nav sidebar listed before the audience split, plus the
 *  one route the split added: the Solo world's own Weekly Review, less
 *  UNLISTED. */
const FULL_INVENTORY = [
  '/solo/review',
  '/home',
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

  it('lists the unlisted routes in no world at all', () => {
    for (const audience of AUDIENCES) {
      const hrefs = navItems(audience).map((item) => item.href);
      for (const href of UNLISTED) expect(hrefs).not.toContain(href);
    }
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

  describe('railSections', () => {
    it('opens on Home in every world', () => {
      for (const audience of AUDIENCES) {
        expect(railSections(audience)[0]!.items[0]!.href).toBe('/home');
      }
    });

    it('leaves Ops out', () => {
      // The rail is icons by default; Ops would make twenty of them out of
      // nine, and it is a drawer of settings-adjacent pages rather than a set
      // of things you run.
      for (const audience of AUDIENCES) {
        const hrefs = railSections(audience).flatMap((s) => s.items.map((i) => i.href));
        expect(hrefs).not.toContain('/system-check');
        expect(hrefs).not.toContain('/privacy');
        expect(hrefs).not.toContain('/usage');
      }
    });

    it('keeps every mode the world offers', () => {
      for (const audience of AUDIENCES) {
        const rail = railSections(audience).flatMap((s) => s.items.map((i) => i.href));
        const opsHrefs = navSections(audience)
          .filter((s) => s.label === 'Ops')
          .flatMap((s) => s.items.map((i) => i.href));
        const expected = navItems(audience)
          .map((i) => i.href)
          .filter((href) => !opsHrefs.includes(href));
        expect(rail).toEqual(expected);
      }
    });
  });

  describe('opsSection', () => {
    it('carries what the rail dropped, less what has a door elsewhere', () => {
      // The rail, the drawer and the handful of pages the window surfaces
      // somewhere better are the world's whole nav between them. Nothing is
      // orphaned; some things simply have a better way in than a nav row.
      for (const audience of AUDIENCES) {
        const rail = railSections(audience).flatMap((s) => s.items.map((i) => i.href));
        const drawer = opsSection(audience)?.items.map((i) => i.href) ?? [];
        const elsewhere = navItems(audience)
          .map((i) => i.href)
          .filter((href) => OPS_ELSEWHERE.has(href));
        // As sets: the agents world's rail already carries What's New, so a
        // page can have a door in more than one of the three.
        expect([...new Set([...rail, ...drawer, ...elsewhere])].sort()).toEqual(
          [...new Set(navItems(audience).map((i) => i.href))].sort(),
        );
      }
    });

    it('never hides a page that has no other door', () => {
      // Every one of these is reachable from somewhere the window draws: two
      // dashboard tiles and a settings section.
      expect([...OPS_ELSEWHERE].sort()).toEqual([
        '/ceremonies',
        '/feedback',
        '/privacy',
        '/provenance',
        '/system-check',
        '/usage',
        '/whats-new',
      ]);
      const dashboard = readFileSync(
        new URL('../src/renderer/pages/yeaboi/home/dashboard.tsx', import.meta.url),
        'utf8',
      );
      // What's New opens from its tile; Usage has no page left, so its tile
      // carries the figures the page used to draw.
      expect(dashboard.includes('href="/whats-new"'), 'no tile opens /whats-new').toBe(true);
      expect(dashboard.includes('usage_get'), 'no tile reads the usage figures').toBe(true);
      const tabs = readFileSync(
        new URL('../src/renderer/lib/yeaboi/settings-tabs.ts', import.meta.url),
        'utf8',
      );
      for (const route of ['/privacy', '/provenance']) {
        expect(tabs.includes(`'${route}'`), `${route} is not a settings tab`).toBe(true);
      }
      // The schedule is declared and read where the dates are.
      const calendar = readFileSync(
        new URL('../src/renderer/components/yeaboi/calendar.tsx', import.meta.url),
        'utf8',
      );
      expect(calendar.includes('DeclareCeremony'), 'the calendar cannot declare one').toBe(true);
      expect(calendar.includes('"/ceremonies"'), 'nothing opens /ceremonies').toBe(true);
      const dock = readFileSync(
        new URL('../src/renderer/components/nav/dock-controls.tsx', import.meta.url),
        'utf8',
      );
      // The button is a toggle, so its href is conditional — what matters is
      // that the dock is what carries the route.
      // Both are buttons on the dock's row: feedback beside the duck, the
      // system check as the pill next to it.
      for (const route of ['/feedback', '/system-check']) {
        expect(dock.includes(`'${route}'`), `nothing in the dock opens ${route}`).toBe(true);
      }
    });

    it('is empty in every world, so the dock draws no drawer', () => {
      for (const audience of AUDIENCES) expect(opsSection(audience)).toBeNull();
    });
  });
});
