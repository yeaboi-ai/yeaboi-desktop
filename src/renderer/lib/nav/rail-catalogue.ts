// What the rail's "+" offers: every page of the route registry a world owns
// that can be opened without an id, grouped, each with the glyph and the
// label it starts with. Pure (test/rail-catalogue.test.ts); the editor
// dialog draws it and the rail provider uses its route set to drop an item
// pointing at a page this build no longer has.

import { audiencesForRoute, isSoloOnlyRoute, type Audience } from '@shared/audience';
import { ABOUT_PAGES } from '@shared/menu';
import type { RailLucideName } from '@shared/rail';
import { APP_ROUTES, type AppRoute } from '@/lib/yeaboi/routes';

export type RailGroup = 'work' | 'modes' | 'settings' | 'about';

export const RAIL_GROUPS: readonly { key: RailGroup; title: string }[] = [
  { key: 'work', title: 'Work' },
  { key: 'modes', title: 'Modes' },
  { key: 'settings', title: 'Settings' },
  { key: 'about', title: 'About the app' },
];

export interface RailDestination {
  route: string;
  /** The registry title, section suffix included. */
  title: string;
  /** What the item is called until it is renamed. */
  label: string;
  group: RailGroup;
  capability: string | null;
  icon: RailLucideName;
}

/** The glyph a capability's pages start with. */
export const CAPABILITY_ICONS: Record<string, RailLucideName> = {
  sessions: 'Sunrise',
  usage: 'Coins',
  'team-analysis': 'ChartLine',
  standup: 'Mic',
  'retro-board': 'MessagesSquare',
  'scrum-poker': 'Dices',
  performance: 'Gauge',
  reporting: 'Presentation',
  ship: 'Rocket',
  'weekly-review': 'CalendarCheck',
  'agent-usage': 'Coins',
  'agent-advisor': 'Compass',
  'agent-security': 'ShieldCheck',
  ceremonies: 'CalendarDays',
  'slack-inbound': 'Hash',
  provenance: 'GitBranch',
  settings: 'Settings',
  connections: 'Plug',
  roadmap: 'Map',
  planning: 'NotebookPen',
};

/** The glyph for a page no capability claims — the About four match the title bar. */
export const ROUTE_ICONS: Record<string, RailLucideName> = {
  '/whats-new': 'Megaphone',
  '/system-check': 'Stethoscope',
  '/privacy': 'Lock',
  '/feedback': 'MessageSquareText',
  '/board': 'SquareKanban',
  '/music': 'Radio',
  '/news': 'Newspaper',
  '/settings/music': 'Music',
  '/settings/appearance': 'Palette',
  '/settings/duck': 'Bird',
  '/settings/news': 'Newspaper',
  '/settings/themes': 'Paintbrush',
  '/settings/themes/edit': 'PenTool',
};

const FALLBACK_ICON: RailLucideName = 'Compass';

/** The mascot goes home and the foot is Settings, so neither is offered. */
const HIDDEN = new Set(['/home', '/settings']);

const ABOUT = new Set(ABOUT_PAGES.map((page) => page.route));

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isRailDestination(route: AppRoute): boolean {
  const { path } = route;
  if (!path.startsWith('/') || HIDDEN.has(path)) return false;
  return !path.split('/').some((segment) => segment.startsWith(':'));
}

export function railGroupFor(route: string): RailGroup {
  if (ABOUT.has(route)) return 'about';
  if (matches(route, '/settings') || route === '/setup') return 'settings';
  if (['/team', '/solo', '/agents'].some((prefix) => matches(route, prefix))) return 'modes';
  return 'work';
}

export function defaultRailIcon(route: string, capability: string | null): RailLucideName {
  return (
    ROUTE_ICONS[route] ?? (capability ? CAPABILITY_ICONS[capability] : undefined) ?? FALLBACK_ICON
  );
}

/** A settings page is named by its section; anything else keeps its title. */
export function defaultRailLabel(title: string): string {
  return title.startsWith('Settings · ') ? title.slice('Settings · '.length) : title;
}

function owned(route: string, audience: Audience): boolean {
  const worlds = audiencesForRoute(route);
  return worlds.length === 0 || worlds.includes(audience);
}

function destination(route: AppRoute): RailDestination {
  return {
    route: route.path,
    title: route.title,
    label: defaultRailLabel(route.title),
    group: railGroupFor(route.path),
    capability: route.capability,
    icon: defaultRailIcon(route.path, route.capability),
  };
}

/** Every world's pages, in group order and registry order inside a group:
 *  what the palette searches, since it may land in another world. */
export function railDestinations(routes: readonly AppRoute[] = APP_ROUTES): RailDestination[] {
  const all = routes.filter(isRailDestination).map(destination);
  return RAIL_GROUPS.flatMap((group) => all.filter((entry) => entry.group === group.key));
}

/** The destinations the palette and the rail's `+` may offer, minus the pages
 *  of a world this build does not have. */
export function visibleRailDestinations(soloEnabled: boolean): RailDestination[] {
  const all = railDestinations();
  return soloEnabled ? all : all.filter((entry) => !isSoloOnlyRoute(entry.route));
}

/** The pages a world's rail can hold. */
export function railCatalogue(audience: Audience): RailDestination[] {
  return railDestinations().filter((entry) => owned(entry.route, audience));
}

/** The routes a world's rail may point at — the normaliser's `known` set. */
export function railRouteSet(audience: Audience): ReadonlySet<string> {
  return new Set(railCatalogue(audience).map((entry) => entry.route));
}

export function railDestinationFor(route: string, audience: Audience): RailDestination | undefined {
  return railCatalogue(audience).find((entry) => entry.route === route);
}
