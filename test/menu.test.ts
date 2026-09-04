// The menu bar's inventory: every page it opens is a registered route, the
// four pages about the app all have a menu, and no shortcut is claimed twice.

import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import {
  ABOUT_PAGES,
  FEEDBACK_PAGES,
  FILE_PAGES,
  PALETTE_COMMAND,
  PRIVACY_PAGES,
  UPDATES_PAGES,
  goPages,
  menuPathnames,
} from '../src/shared/menu';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const PATHS = new Set(registry.routes.map((r) => r.path));

describe('menu bar', () => {
  it('opens only registered routes in every world', () => {
    for (const audience of AUDIENCES) {
      for (const pathname of menuPathnames(audience)) {
        expect(PATHS.has(pathname), `${pathname} is not in routes.json`).toBe(true);
      }
    }
  });

  it('gives the four pages about the app a menu each', () => {
    const pathnames = menuPathnames('team');
    for (const route of ['/whats-new', '/system-check', '/privacy', '/feedback']) {
      expect(pathnames).toContain(route);
    }
  });

  it('lists the four About pages once each, by title, for the title bar', () => {
    expect(ABOUT_PAGES.map((p) => p.route)).toEqual([
      '/whats-new',
      '/system-check',
      '/privacy',
      '/feedback',
    ]);
    for (const page of ABOUT_PAGES) {
      expect(PATHS.has(page.route), `${page.route} is not in routes.json`).toBe(true);
      expect(page.route.startsWith('/settings')).toBe(false);
      expect(page.label).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });

  it('sends Agents to its own projects list', () => {
    expect(goPages('agents').find((p) => p.label === 'Projects')?.route).toBe('/agents/projects');
    expect(goPages('team').find((p) => p.label === 'Projects')?.route).toBe('/projects');
  });

  it('claims every shortcut once', () => {
    const accelerators = [PALETTE_COMMAND, ...FILE_PAGES, ...goPages('team')]
      .map((p) => p.accelerator)
      .filter((a): a is string => Boolean(a));
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it('labels every item in sentence case', () => {
    for (const page of [
      PALETTE_COMMAND,
      ...FILE_PAGES,
      ...goPages('team'),
      ...UPDATES_PAGES,
      ...PRIVACY_PAGES,
      ...FEEDBACK_PAGES,
    ]) {
      expect(page.label.length).toBeGreaterThan(0);
      expect(page.label).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});
