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
  // Privacy is a settings page that happens to live at the top level: what is
  // sent where, and the switches that decide it. It keeps its route — the
  // manifest and the terminal both name it — and reads as a settings section
  // here, which is where anyone would look for it.
  { route: '/privacy', title: 'Privacy' },
];

/** Every tab the contract and this window declare between them. */
export const ALL_SETTINGS_TABS: readonly { route: string; title: string }[] = [
  ...SETTINGS_TABS.map((t) => ({ route: t.route, title: t.title })),
  ...CHROME_TABS,
];

/** Tabs whose sections render inside another tab rather than on a page of
 *  their own.
 *
 *  Sharing is one switch and a timeout — a whole surface for a card and a half,
 *  which read as a page that had lost something. It sits in System, which is
 *  already where this machine's own behaviour is configured. The contract still
 *  declares the tab, because the terminal draws its sections its own way; only
 *  this window folds it. */
export const FOLDED_TABS: Readonly<Record<string, string>> = {
  '/settings/sharing': '/settings/system',
};

/** The tabs this window offers as places to go. */
export const OFFERED_SETTINGS_TABS: readonly { route: string; title: string }[] =
  ALL_SETTINGS_TABS.filter((tab) => !(tab.route in FOLDED_TABS));
