// The section list of the Settings page, mirroring the TUI's
// _SETTINGS_TAB_SECTIONS plus the sections that configure this window.
//
// routes.json is the source, for the same reason it is the source of the
// routes: it is what the manifest carries into Python, where
// tests/unit/test_tui_parity.py holds the section list against the
// terminal's — a settings section that lands in one surface only fails the
// build.

import registry from './routes.json';

export interface SettingsTab {
  route: string;
  title: string;
  sections: readonly string[];
}

export interface TabLink {
  route: string;
  title: string;
}

export const SETTINGS_TABS: readonly SettingsTab[] = registry.settings_tabs;

/** Tabs that configure this window rather than the engine.
 *
 *  They are ordinary routes, never settings_tabs entries: that block is held
 *  equal to the terminal's section list, and the terminal has no appearance,
 *  themes or desktop-duck section to match.
 *
 *  Themes is a route but not a row here: it is reached from the Appearance
 *  section, which is where the rest of this window's look is chosen. */
export const CHROME_TABS: readonly TabLink[] = [
  { route: '/settings/appearance', title: 'Appearance' },
  { route: '/settings/news', title: 'Front page' },
  { route: '/settings/duck', title: 'Duck' },
  { route: '/settings/music', title: 'Player' },
];

export type SettingsGroupKey = 'engine' | 'window';

export interface SettingsGroup {
  key: SettingsGroupKey;
  title: string;
  tabs: readonly TabLink[];
}

/** The two groups of the section list, in list order. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    key: 'engine',
    title: 'Engine',
    tabs: SETTINGS_TABS.map((t) => ({ route: t.route, title: t.title })),
  },
  { key: 'window', title: 'Look & feel', tabs: CHROME_TABS },
];

/** Every section on the settings page, in list order. */
export const ALL_SETTINGS_TABS: readonly TabLink[] = SETTINGS_GROUPS.flatMap((g) => g.tabs);

export const SETTINGS_LEAD =
  'One config behind every surface: this window, the terminal, and the agents.';
