import { DEFAULT_TURN_SPEED, type TurnSpeedId } from '@/lib/news/turn';

// Typed localStorage helper. Centralises all keys + defaults so prefs don't drift
// across components. Safe to call during SSR — guards against missing window.

type PrefShape = {
  'ticket.sidebarCollapsed': boolean;
  'panel.width': number;
  'board.density': 'comfortable' | 'compact';
  'board.groupBy': BoardGroupBy;
  'board.sortBy': BoardSortKey;
  'board.savedViews': SavedBoardView[];
  /**
   * Tracks whether the user has *deliberately* set a groupBy. The board's
   * "auto-default to Wave for fresh boards" rule fires only while this is
   * false. Set to true the first time the user touches the dropdown.
   */
  'board.groupByExplicit': boolean;
  /** How fast the front page turns its stories; `hand` stops the clock. */
  'news.turnSpeed': TurnSpeedId;
  /** Whether the front page's index of other headlines is unfolded. */
  'news.insideOpen': boolean;
};

export type BoardGroupBy =
  'off' | 'wave' | 'assignee' | 'priority' | 'project' | 'label' | 'parent';

export type BoardSortKey =
  | 'manual'
  | 'created_desc'
  | 'created_asc'
  | 'updated_desc'
  | 'title_asc'
  | 'title_desc'
  | 'priority_desc'
  | 'story_points_desc'
  | 'story_points_asc'
  | 'ticket_number_asc';

export interface SavedBoardView {
  id: string;
  name: string;
  query: string; // serialised URL search params
  createdAt: string; // ISO
}

const DEFAULTS: PrefShape = {
  'ticket.sidebarCollapsed': false,
  'panel.width': 480,
  'board.density': 'comfortable',
  'board.groupBy': 'off',
  'board.groupByExplicit': false,
  'board.sortBy': 'manual',
  'board.savedViews': [],
  'news.turnSpeed': DEFAULT_TURN_SPEED,
  'news.insideOpen': false,
};

export function getPref<K extends keyof PrefShape>(key: K): PrefShape[K] {
  if (typeof window === 'undefined') return DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return DEFAULTS[key];
    return JSON.parse(raw) as PrefShape[K];
  } catch {
    return DEFAULTS[key];
  }
}

export function setPref<K extends keyof PrefShape>(key: K, value: PrefShape[K]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — silently drop.
  }
}

export function clearPref<K extends keyof PrefShape>(key: K): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
