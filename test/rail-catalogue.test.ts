// The "+" offers only pages that exist, open without an id, and belong to
// the world — and every one of them has a glyph to start with.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIENCES, audiencesForRoute } from '../src/shared/audience';
import { ABOUT_PAGES } from '../src/shared/menu';
import { RAIL_DEFAULTS, RAIL_LUCIDE_ICONS } from '../src/shared/rail';
import {
  CAPABILITY_ICONS,
  RAIL_GROUPS,
  ROUTE_ICONS,
  defaultRailIcon,
  defaultRailLabel,
  railCatalogue,
  railDestinationFor,
  railDestinations,
  railGroupFor,
  railRouteSet,
  visibleRailDestinations,
} from '../src/renderer/lib/nav/rail-catalogue';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
) as { routes: { path: string; capability: string | null }[] };
const REGISTERED = new Set(registry.routes.map((route) => route.path));
const ICON_NAMES = new Set<string>(RAIL_LUCIDE_ICONS);

describe('railDestinations', () => {
  it("holds every world's catalogue, in the same order", () => {
    const all = railDestinations().map((entry) => entry.route);
    for (const audience of AUDIENCES) {
      const routes = railCatalogue(audience).map((entry) => entry.route);
      const kept = all.filter((route) => routes.includes(route));
      expect(kept).toEqual(routes);
    }
  });
});

describe('railCatalogue', () => {
  it('offers only registered pages that open without an id', () => {
    for (const audience of AUDIENCES) {
      for (const entry of railCatalogue(audience)) {
        expect(REGISTERED, `${entry.route} is not in routes.json`).toContain(entry.route);
        expect(entry.route.startsWith('/')).toBe(true);
        expect(entry.route).not.toContain(':');
      }
    }
  });

  it('never offers the home or the foot', () => {
    for (const audience of AUDIENCES) {
      const routes = railCatalogue(audience).map((entry) => entry.route);
      expect(routes).not.toContain('/home');
      expect(routes).not.toContain('/settings');
    }
  });

  it('offers a world only the pages it owns', () => {
    for (const audience of AUDIENCES) {
      for (const entry of railCatalogue(audience)) {
        const worlds = audiencesForRoute(entry.route);
        if (worlds.length > 0) expect(worlds, `${entry.route} in ${audience}`).toContain(audience);
      }
    }
    const solo = railCatalogue('solo').map((entry) => entry.route);
    expect(solo).toContain('/sessions');
    expect(railCatalogue('team').map((e) => e.route)).not.toContain('/solo/review');
    expect(railCatalogue('solo').map((e) => e.route)).not.toContain('/team/retro');
    expect(railCatalogue('team').map((e) => e.route)).toContain('/team/retro');
  });

  it('offers every page the rail starts with', () => {
    for (const audience of AUDIENCES) {
      const known = railRouteSet(audience);
      for (const entry of RAIL_DEFAULTS[audience]) expect(known).toContain(entry.route);
    }
  });

  it('offers the four About pages everywhere', () => {
    for (const audience of AUDIENCES) {
      const routes = railCatalogue(audience).map((entry) => entry.route);
      for (const page of ABOUT_PAGES) expect(routes).toContain(page.route);
    }
  });

  it('lists each page once, in group order', () => {
    const order = RAIL_GROUPS.map((group) => group.key);
    for (const audience of AUDIENCES) {
      const entries = railCatalogue(audience);
      expect(new Set(entries.map((e) => e.route)).size).toBe(entries.length);
      const seen = entries.map((e) => order.indexOf(e.group));
      expect([...seen].sort((a, b) => a - b)).toEqual(seen);
      for (const entry of entries) expect(order).toContain(entry.group);
    }
  });

  it('gives every page a glyph the rail can draw', () => {
    for (const audience of AUDIENCES) {
      for (const entry of railCatalogue(audience)) {
        expect(ICON_NAMES, `${entry.route} draws ${entry.icon}`).toContain(entry.icon);
        if (entry.capability) {
          expect(CAPABILITY_ICONS, `${entry.capability} has no glyph`).toHaveProperty(
            entry.capability,
          );
        } else {
          expect(ROUTE_ICONS, `${entry.route} has no glyph`).toHaveProperty(entry.route);
        }
      }
    }
    for (const name of [...Object.values(CAPABILITY_ICONS), ...Object.values(ROUTE_ICONS)]) {
      expect(ICON_NAMES).toContain(name);
    }
  });
});

describe('railGroupFor', () => {
  it.each([
    ['/sessions', 'work'],
    ['/news', 'work'],
    ['/board', 'work'],
    ['/ceremonies/slack', 'work'],
    ['/team/standup', 'modes'],
    ['/solo/review', 'modes'],
    ['/agents/security', 'modes'],
    ['/settings/duck', 'settings'],
    ['/setup', 'settings'],
    ['/feedback', 'about'],
    ['/whats-new', 'about'],
  ])('%s is %s', (route, group) => {
    expect(railGroupFor(route)).toBe(group);
  });
});

describe('defaults for a page', () => {
  it('names a settings page by its section and keeps other titles whole', () => {
    expect(defaultRailLabel('Settings · Credentials')).toBe('Credentials');
    expect(defaultRailLabel('Standup · Setup')).toBe('Standup · Setup');
    expect(defaultRailLabel('Feedback')).toBe('Feedback');
  });

  it('prefers the page glyph, then the capability glyph, then a compass', () => {
    expect(defaultRailIcon('/feedback', null)).toBe('MessageSquareText');
    expect(defaultRailIcon('/team/standup', 'standup')).toBe('Mic');
    expect(defaultRailIcon('/nowhere', null)).toBe('Compass');
    expect(defaultRailIcon('/nowhere', 'unknown-capability')).toBe('Compass');
  });

  it('finds a destination by route within the world', () => {
    expect(railDestinationFor('/team/standup', 'team')?.label).toBe('Standup');
    expect(railDestinationFor('/team/retro', 'solo')).toBeUndefined();
  });
});

describe('visibleRailDestinations', () => {
  it('drops the Solo world pages when the build does not offer it', () => {
    const hidden = visibleRailDestinations(false).map((entry) => entry.route);
    expect(hidden.some((route) => route.startsWith('/agents'))).toBe(false);
    expect(hidden.some((route) => route.startsWith('/solo'))).toBe(false);
    expect(hidden).toContain('/sessions');
  });

  it('offers everything when it does', () => {
    const shown = visibleRailDestinations(true).map((entry) => entry.route);
    expect(shown).toContain('/agents/usage');
    expect(shown).toEqual(railDestinations().map((entry) => entry.route));
  });
});
