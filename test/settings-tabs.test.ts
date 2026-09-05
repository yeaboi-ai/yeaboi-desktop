// The settings section list's registry. Every row is a route, and the chrome
// tabs must stay out of settings_tabs — that block is held equal to the terminal's
// section list by yeaboi.ai's test_tui_parity.py, and the terminal has no
// appearance, themes or duck section to match.

import { describe, expect, it } from 'vitest';
import {
  ALL_SETTINGS_TABS,
  CHROME_TABS,
  SETTINGS_GROUPS,
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
});

describe('settings groups', () => {
  it('flatten to the list, engine first', () => {
    expect(SETTINGS_GROUPS.map((g) => g.key)).toEqual(['engine', 'window']);
    expect(SETTINGS_GROUPS.flatMap((g) => g.tabs)).toEqual(ALL_SETTINGS_TABS);
  });

  it('hold the engine sections in one group and the window sections in the other', () => {
    const [engine, window] = SETTINGS_GROUPS;
    expect(engine!.tabs.map((t) => t.route)).toEqual(SETTINGS_TABS.map((t) => t.route));
    expect(window!.tabs).toEqual(CHROME_TABS);
  });

  it('list only settings routes', () => {
    for (const tab of ALL_SETTINGS_TABS) {
      expect(tab.route.startsWith('/settings/'), tab.route).toBe(true);
    }
  });

  it('title every group and row in sentence case', () => {
    for (const group of SETTINGS_GROUPS) {
      expect(group.title).toBeTruthy();
      expect(group.title).not.toMatch(/\b[A-Z]{2,}\b/);
      for (const tab of group.tabs) expect(tab.title).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});
