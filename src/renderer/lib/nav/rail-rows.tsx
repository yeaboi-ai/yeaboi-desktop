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
  Lock,
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

import { OFFERED_SETTINGS_TABS } from '@/lib/yeaboi/settings-tabs';
import { railSections, type IconKey } from '@/lib/nav/sections';
import type { Audience } from '@shared/audience';

export type RailIcon = typeof Home;

export interface RailRow {
  href: string;
  label: string;
  Icon: RailIcon;
  /** A hairline goes above this row: the group it opens. Carried on the row
   *  rather than on a wrapper because a list swap is row-by-row, and a slot
   *  mid-swap can be holding a row from either list. */
  opensGroup?: boolean;
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
  '/privacy': Lock,
};

/** The way back, kept at the top of every list the rail holds. */
export const HOME_ROW: RailRow = { href: '/home', label: 'Home', Icon: Home };

/** Whether the rail is holding settings. Not simply a prefix: settings has
 *  adopted a page or two that keep their own top-level route. */
export function isSettingsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return true;
  return OFFERED_SETTINGS_TABS.some(
    (tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`),
  );
}

function modeRows(audience: Audience): RailRow[] {
  return railSections(audience).flatMap((section, index) =>
    section.items.map((item, position) => ({
      href: item.href,
      label: item.label,
      Icon: MODE_ICONS[item.icon] ?? Bot,
      opensGroup: index > 0 && position === 0,
    })),
  );
}

/** Home, then the sections — the same shape the worlds have, so the hairline
 *  lands in the same place and only the icons below it change. */
function settingsRows(): RailRow[] {
  return [
    HOME_ROW,
    ...OFFERED_SETTINGS_TABS.map((tab, index) => ({
      href: tab.route,
      label: tab.title,
      Icon: SETTINGS_ICONS[tab.route] ?? SlidersHorizontal,
      opensGroup: index === 0,
    })),
  ];
}

/** The rail's list for a mode: an audience, or settings. */
export function railRows(mode: Audience | 'settings'): RailRow[] {
  return mode === 'settings' ? settingsRows() : modeRows(mode);
}
