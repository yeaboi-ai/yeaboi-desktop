// The settings tab bar's registry. Every tab is a route, and the chrome tabs
// must stay out of settings_tabs — that block is held equal to the terminal's
// section list by yeaboi.ai's test_tui_parity.py, and the terminal has no
// appearance, themes or duck section to match.

import { describe, expect, it } from 'vitest';
import {
  ALL_SETTINGS_TABS,
  CHROME_TABS,
  FOLDED_TABS,
  OFFERED_SETTINGS_TABS,
  SETTINGS_TABS,
} from '../src/renderer/lib/yeaboi/settings-tabs';
import registry from '../src/renderer/lib/yeaboi/routes.json';
import { readFileSync } from 'node:fs';

const PATHS = new Set(registry.routes.map((r) => r.path));
const ROUTES_TSX = readFileSync(new URL('../src/renderer/app/routes.tsx', import.meta.url), 'utf8');

describe('settings tabs', () => {
  it('every tab is a registered route', () => {
    for (const tab of ALL_SETTINGS_TABS) {
      expect(PATHS.has(tab.route), `${tab.route} is not in routes.json`).toBe(true);
    }
  });

  // A tab in routes.json but absent from routes.tsx renders PlaceholderPage,
  // silently, with the manifest check and every other test here still green.
  it('every tab reaches a real page in routes.tsx', () => {
    for (const tab of ALL_SETTINGS_TABS) {
      expect(
        ROUTES_TSX.includes(`'${tab.route}'`),
        `${tab.route} is not served in routes.tsx`,
      ).toBe(true);
    }
  });

  it('no route is claimed by two tabs', () => {
    const routes = ALL_SETTINGS_TABS.map((t) => t.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('every tab has a title', () => {
    for (const tab of ALL_SETTINGS_TABS) {
      expect(tab.title.length).toBeGreaterThan(0);
    }
  });

  it('themes is chrome, not an engine tab', () => {
    expect(CHROME_TABS.map((t) => t.route)).toContain('/settings/themes');
    expect(SETTINGS_TABS.map((t) => t.route)).not.toContain('/settings/themes');
  });

  it('chrome tabs carry no engine sections', () => {
    const engineRoutes = new Set(SETTINGS_TABS.map((t) => t.route));
    for (const tab of CHROME_TABS) {
      expect(engineRoutes.has(tab.route)).toBe(false);
    }
  });

  describe('folded tabs', () => {
    it('folds each one into a tab that is still offered', () => {
      const offered = new Set(OFFERED_SETTINGS_TABS.map((t) => t.route));
      for (const [from, into] of Object.entries(FOLDED_TABS)) {
        expect(offered.has(from), `${from} is folded and still offered`).toBe(false);
        expect(offered.has(into), `${from} folds into ${into}, which is not offered`).toBe(true);
      }
    });

    // The contract declares the tab and the terminal draws it, so the route
    // stays registered — it just lands where the sections went.
    it('keeps the folded route reachable', () => {
      for (const from of Object.keys(FOLDED_TABS)) {
        expect(PATHS.has(from), `${from} is not in routes.json`).toBe(true);
        expect(ROUTES_TSX.includes(`'${from}'`), `${from} is not served in routes.tsx`).toBe(true);
      }
    });
  });
});
