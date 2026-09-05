// What the rail is a list of, whichever list it is holding.
//
// Normally the world's modes. On settings it is the settings sections — the
// tabs used to be a strip across the top of the page, which meant the window
// carried two navigations at once: a rail down the side for where you are, and
// a bar above the content for where you are *within* it. The rail already is
// the "where you are" surface, so settings borrows it.

import {
  BarChart3,
  Bird,
  Blocks,
  Bot,
  CalendarClock,
  Columns3,
  Gauge,
  Home,
  KeyRound,
  LayoutGrid,
  Map,
  Megaphone,
  Palette,
  Presentation,
  RotateCcw,
  Rocket,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Spade,
  Sunrise,
  SwatchBook,
  TrendingUp,
} from 'lucide-react';

import { ALL_SETTINGS_TABS } from '@/lib/yeaboi/settings-tabs';
import { railSections, type IconKey } from '@/lib/nav/sections';
import type { Audience } from '@shared/audience';

export type RailIcon = typeof Home;

export interface RailRow {
  href: string;
  label: string;
  Icon: RailIcon;
}

/** One hairline's worth of rows. */
export interface RailGroup {
  key: string;
  rows: RailRow[];
}

const MODE_ICONS: Partial<Record<IconKey, RailIcon>> = {
  home: Home,
  projects: LayoutGrid,
  board: Columns3,
  roadmap: Map,
  analysis: BarChart3,
  standup: Sunrise,
  retro: RotateCcw,
  poker: Spade,
  performance: TrendingUp,
  reporting: Presentation,
  ship: Rocket,
  review: CalendarClock,
  'agent-usage': Gauge,
  'agent-advisor': Megaphone,
  'agent-standup': Sunrise,
  'agent-security': ShieldCheck,
};

const SETTINGS_ICONS: Record<string, RailIcon> = {
  '/settings/credentials': KeyRound,
  '/settings/connections': Blocks,
  '/settings/sharing': Share2,
  '/settings/system': SlidersHorizontal,
  '/settings/appearance': Palette,
  '/settings/themes': SwatchBook,
  '/settings/duck': Bird,
};

/** The way back, kept at the top of every list the rail holds. */
export const HOME_ROW: RailRow = { href: '/home', label: 'Home', Icon: Home };

export function isSettingsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && (pathname === '/settings' || pathname.startsWith('/settings/')));
}

function modeGroups(audience: Audience): RailGroup[] {
  return railSections(audience).map((section, index) => ({
    key: section.label ?? `top-${index}`,
    rows: section.items.map((item) => ({
      href: item.href,
      label: item.label,
      Icon: MODE_ICONS[item.icon] ?? Bot,
    })),
  }));
}

/** Home, then the sections — the same two-group shape the worlds have, so the
 *  hairline lands in the same place and only the icons below it change. */
function settingsGroups(): RailGroup[] {
  return [
    { key: 'home', rows: [HOME_ROW] },
    {
      key: 'settings',
      rows: ALL_SETTINGS_TABS.map((tab) => ({
        href: tab.route,
        label: tab.title,
        Icon: SETTINGS_ICONS[tab.route] ?? SlidersHorizontal,
      })),
    },
  ];
}

/** The rail's list for a mode: an audience, or settings. */
export function railGroups(mode: Audience | 'settings'): RailGroup[] {
  return mode === 'settings' ? settingsGroups() : modeGroups(mode);
}
