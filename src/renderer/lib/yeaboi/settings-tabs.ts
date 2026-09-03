// The tab → section arrangement for the yeaboi Settings pages, mirroring the
// TUI's _SETTINGS_TAB_SECTIONS, plus the About group this window adds.
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
 *  themes or desktop-duck section to match. */
export const CHROME_TABS: readonly TabLink[] = [
  { route: '/settings/appearance', title: 'Appearance' },
  { route: '/settings/themes', title: 'Themes' },
  { route: '/settings/duck', title: 'Duck' },
];

/** The pages about the app itself. Their routes and capabilities are what they
 *  always were; only the way in moved, from the rail to Settings. */
export const ABOUT_TABS: readonly TabLink[] = [
  { route: '/whats-new', title: "What's new" },
  { route: '/system-check', title: 'System check' },
  { route: '/privacy', title: 'Privacy' },
  { route: '/feedback', title: 'Feedback' },
];

export type SettingsGroupKey = 'configure' | 'about';

export interface SettingsTabGroup {
  key: SettingsGroupKey;
  title: string;
  lead: string;
  tabs: readonly TabLink[];
}

export const SETTINGS_TAB_GROUPS: readonly SettingsTabGroup[] = [
  {
    key: 'configure',
    title: 'Settings',
    lead: 'One config behind every surface: this window, the terminal, and the agents.',
    tabs: [...SETTINGS_TABS.map((t) => ({ route: t.route, title: t.title })), ...CHROME_TABS],
  },
  {
    key: 'about',
    title: 'About this app',
    lead: 'What changed, what this machine can reach, what leaves it, and where to say so.',
    tabs: ABOUT_TABS,
  },
];

/** Every tab on the settings page, in bar order. */
export const ALL_SETTINGS_TABS: readonly TabLink[] = SETTINGS_TAB_GROUPS.flatMap((g) => g.tabs);

/** The group a pathname belongs to. Anything not in About configures. */
export function settingsGroupFor(pathname: string): SettingsGroupKey {
  return ABOUT_TABS.some((t) => pathname === t.route || pathname.startsWith(`${t.route}/`))
    ? 'about'
    : 'configure';
}
