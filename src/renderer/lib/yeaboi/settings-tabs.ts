// The tab → section arrangement for the yeaboi Settings pages, mirroring the
// TUI's _SETTINGS_TAB_SECTIONS.
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

export const SETTINGS_TABS: readonly SettingsTab[] = registry.settings_tabs;

/** Tabs that configure this window rather than the engine.
 *
 *  They are ordinary routes, never settings_tabs entries: that block is held
 *  equal to the terminal's section list, and the terminal has no appearance,
 *  themes or desktop-duck section to match. */
export const CHROME_TABS: readonly { route: string; title: string }[] = [
  { route: '/settings/appearance', title: 'Appearance' },
  { route: '/settings/themes', title: 'Themes' },
  { route: '/settings/duck', title: 'Duck' },
];

/** Every tab on the settings page, in bar order. */
export const ALL_SETTINGS_TABS: readonly { route: string; title: string }[] = [
  ...SETTINGS_TABS.map((t) => ({ route: t.route, title: t.title })),
  ...CHROME_TABS,
];
