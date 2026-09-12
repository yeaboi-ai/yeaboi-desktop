// The rail's icons, one list per world, and the one function that turns
// whatever settings.json holds into a rail that will actually draw.
//
// Pure — no Electron import and no route registry — so main can clamp the
// stored blob, the renderer can clamp the same blob again with the routes it
// knows (`known`), and the tests cover both in the node lane.

import { AUDIENCES, planningHref, type Audience } from './audience';
import { isPersonaId, type PersonaId } from './personas';

/** The drawn glyphs a rail icon may pick from. Renderer-side, lib/nav/rail-icons.ts
 *  maps every name here to its component, so a typo fails the type check. */
export const RAIL_LUCIDE_ICONS = [
  'LayoutGrid',
  'Sunrise',
  'SquareKanban',
  'Users',
  'User',
  'Mic',
  'Megaphone',
  'MessageSquareText',
  'MessagesSquare',
  'Lock',
  'Stethoscope',
  'Coins',
  'ChartLine',
  'Gauge',
  'Presentation',
  'Rocket',
  'Bot',
  'ShieldCheck',
  'Sparkles',
  'Compass',
  'GitBranch',
  'Calendar',
  'CalendarCheck',
  'CalendarDays',
  'Clock',
  'Flag',
  'Folder',
  'FolderKanban',
  'Inbox',
  'Layers',
  'ListChecks',
  'Map',
  'NotebookPen',
  'Pencil',
  'PenTool',
  'Paintbrush',
  'Palette',
  'Bird',
  'Newspaper',
  'Radio',
  'Hash',
  'Repeat',
  'Star',
  'Target',
  'Ticket',
  'Trophy',
  'Wrench',
  'Zap',
  'BookOpen',
  'Plug',
  'Share2',
  'HardDrive',
  'SlidersHorizontal',
  'Eye',
  'FileText',
  'Dices',
  'Handshake',
  'Activity',
  'Waves',
  'Settings',
  'Heart',
  'Lightbulb',
  'Bug',
  'Bell',
  'Bookmark',
  'Camera',
  'Coffee',
  'Flame',
  'Gift',
  'Globe',
  'Key',
  'Leaf',
  'Music',
  'Puzzle',
  'Search',
  'Send',
  'Shield',
  'Smile',
  'Tag',
  'Terminal',
  'Timer',
  'Video',
  'Wand',
] as const;

export type RailLucideName = (typeof RAIL_LUCIDE_ICONS)[number];

export type RailIcon =
  | { kind: 'lucide'; name: RailLucideName }
  | { kind: 'persona'; id: PersonaId }
  | { kind: 'image'; dataUrl: string };

export interface RailItem {
  id: string;
  /** A registered route; the renderer drops one this build no longer has. */
  route: string;
  label: string;
  icon: RailIcon;
}

export type RailPrefs = Record<Audience, RailItem[]>;

export const RAIL_LIMITS = {
  items: 12,
  label: 40,
  route: 200,
  /** Characters of data URL: an uploaded icon is downscaled before it is stored. */
  imageChars: 64 * 1024,
} as const;

/** Ids the rail draws itself, so an item can never collide with them. */
export const RESERVED_RAIL_IDS: readonly string[] = ['home', 'settings', 'add'];

const ID_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;
const IMAGE_SHAPE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isRailLucideName(value: unknown): value is RailLucideName {
  return typeof value === 'string' && (RAIL_LUCIDE_ICONS as readonly string[]).includes(value);
}

/** Where every world's rail starts: your plans and the board. The modes
 *  are the home's menu, behind the mascot. */
export function railDefaultsFor(audience: Audience): RailItem[] {
  return [
    {
      id: 'planning',
      route: planningHref(audience),
      label: 'Planning',
      icon: { kind: 'lucide', name: 'NotebookPen' },
    },
    {
      id: 'board',
      route: '/board',
      label: 'Board',
      icon: { kind: 'lucide', name: 'SquareKanban' },
    },
  ];
}

export const RAIL_DEFAULTS: RailPrefs = {
  solo: railDefaultsFor('solo'),
  team: railDefaultsFor('team'),
};

function railRoute(value: unknown, known?: ReadonlySet<string>): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.length > RAIL_LIMITS.route || /[:?#\s]/.test(value)) return null;
  if (known && !known.has(value)) return null;
  return value;
}

function railLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, RAIL_LIMITS.label);
  return trimmed.length > 0 ? trimmed : null;
}

function railIcon(value: unknown): RailIcon | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  switch (source['kind']) {
    case 'lucide':
      return isRailLucideName(source['name']) ? { kind: 'lucide', name: source['name'] } : null;
    case 'persona':
      return isPersonaId(source['id']) ? { kind: 'persona', id: source['id'] } : null;
    case 'image': {
      const dataUrl = source['dataUrl'];
      if (typeof dataUrl !== 'string' || dataUrl.length > RAIL_LIMITS.imageChars) return null;
      return IMAGE_SHAPE.test(dataUrl) ? { kind: 'image', dataUrl } : null;
    }
    default:
      return null;
  }
}

/** One stored item, or null when any part of it cannot be drawn. The id is
 *  passed through only when it is well-formed; the caller settles collisions. */
export function normalizeRailItem(raw: unknown, known?: ReadonlySet<string>): RailItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const route = railRoute(source['route'], known);
  const label = railLabel(source['label']);
  const icon = railIcon(source['icon']);
  if (!route || !label || !icon) return null;
  const id = typeof source['id'] === 'string' && ID_SHAPE.test(source['id']) ? source['id'] : '';
  return { id, route, label, icon };
}

/**
 * One world's list. An array is taken as given — an empty rail is a choice,
 * the mascot still goes home and the Go menu still opens the doors — while
 * anything that is not an array means the world was never arranged. Each page
 * appears once; a bad, reserved or repeated id is replaced by its index so the
 * defaults are a fixed point of normalisation.
 */
export function normalizeRailItems(
  raw: unknown,
  audience: Audience,
  known?: ReadonlySet<string>,
): RailItem[] {
  if (!Array.isArray(raw)) return normalizeRailItems(railDefaultsFor(audience), audience, known);
  const items: RailItem[] = [];
  const routes = new Set<string>();
  const ids = new Set<string>();
  for (const entry of raw) {
    if (items.length >= RAIL_LIMITS.items) break;
    const item = normalizeRailItem(entry, known);
    if (!item || routes.has(item.route)) continue;
    const index = items.length;
    const id =
      item.id && !RESERVED_RAIL_IDS.includes(item.id) && !ids.has(item.id)
        ? item.id
        : `item-${index}`;
    routes.add(item.route);
    ids.add(id);
    items.push({ ...item, id });
  }
  return items;
}

/** Whether a stored list is the untouched default, and so safe to replace.
 *  `normalizeRailPrefs` writes every world back, so "Solo has no arrangement"
 *  is the defaults, not a missing key. */
function isDefaultRail(value: unknown, audience: Audience): boolean {
  if (value === undefined) return true;
  return JSON.stringify(value) === JSON.stringify(railDefaultsFor(audience));
}

/** The Agents world merged into Solo, so a rail arranged there is Solo's now —
 *  unless Solo carries an arrangement of its own, since two cannot become one
 *  without guessing. `/agents/*` is Solo-owned after the merge, so an adopted
 *  list still validates. */
function foldAgentsRail(source: Record<string, unknown>): Record<string, unknown> {
  if (!('agents' in source) || !isDefaultRail(source['solo'], 'solo')) return source;
  const { agents, ...rest } = source;
  return { ...rest, solo: agents };
}

/** Read a stored blob into a rail per world that will draw. */
export function normalizeRailPrefs(raw: unknown, known?: ReadonlySet<string>): RailPrefs {
  const source = foldAgentsRail(
    (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>,
  );
  const prefs = {} as RailPrefs;
  for (const audience of AUDIENCES) {
    prefs[audience] = normalizeRailItems(source[audience], audience, known);
  }
  return prefs;
}

/** Replace the worlds a patch names, whole, and leave the rest as they are. */
export function mergeRailPrefs(
  current: RailPrefs,
  patch: unknown,
  known?: ReadonlySet<string>,
): RailPrefs {
  if (!patch || typeof patch !== 'object') return current;
  const incoming = patch as Record<string, unknown>;
  const next = { ...current };
  for (const audience of AUDIENCES) {
    if (audience in incoming) {
      next[audience] = normalizeRailItems(incoming[audience], audience, known);
    }
  }
  return next;
}

/** A fresh id for an added item: the clock plus a little noise, in the id
 *  alphabet. Uniqueness within one rail is what matters, and the normaliser
 *  settles a collision anyway. */
export function newRailItemId(): string {
  const noise = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `r${Date.now().toString(36)}-${noise}`;
}
