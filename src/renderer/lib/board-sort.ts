import type { Card } from '@/hooks/use-board';
import type { BoardSortKey } from '@/lib/preferences';

// Lower rank = higher priority. Cards without a priority sort to the end.
const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const priorityRank = (p: string | null | undefined): number => (p ? (PRIORITY_RANK[p] ?? 99) : 99);

const compareNullable = <T>(
  a: T | null | undefined,
  b: T | null | undefined,
  cmp: (x: T, y: T) => number,
): number => {
  // null/undefined sort to the end regardless of direction.
  if ((a === null || a === undefined) && (b === null || b === undefined)) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return cmp(a, b);
};

export interface BoardSortOption {
  key: BoardSortKey;
  label: string;
  group?: string;
}

export const BOARD_SORT_OPTIONS: BoardSortOption[] = [
  { key: 'manual', label: 'Manual order', group: 'Default' },
  { key: 'ticket_number_asc', label: 'Ticket # (1.1, 1.2, 2.1…)', group: 'Identity' },
  { key: 'title_asc', label: 'Title (A → Z)', group: 'Identity' },
  { key: 'title_desc', label: 'Title (Z → A)', group: 'Identity' },
  { key: 'priority_desc', label: 'Priority (highest first)', group: 'Priority' },
  { key: 'story_points_desc', label: 'Story points (largest first)', group: 'Estimate' },
  { key: 'story_points_asc', label: 'Story points (smallest first)', group: 'Estimate' },
  { key: 'created_desc', label: 'Newest first', group: 'Date' },
  { key: 'created_asc', label: 'Oldest first', group: 'Date' },
  { key: 'updated_desc', label: 'Recently updated', group: 'Date' },
];

/**
 * Sort cards within a column. Returns a new array; never mutates input.
 * 'manual' returns the cards untouched (server-side position order).
 */
export function sortCards(cards: readonly Card[], key: BoardSortKey): Card[] {
  if (key === 'manual') return cards.slice();
  const out = cards.slice();

  switch (key) {
    case 'title_asc':
      out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      return out;
    case 'title_desc':
      out.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
      return out;
    case 'priority_desc':
      out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
      return out;
    case 'story_points_desc':
      out.sort((a, b) => compareNullable(a.story_points, b.story_points, (x, y) => y - x));
      return out;
    case 'story_points_asc':
      out.sort((a, b) => compareNullable(a.story_points, b.story_points, (x, y) => x - y));
      return out;
    case 'created_desc':
      out.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return out;
    case 'created_asc':
      out.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return out;
    case 'updated_desc':
      out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return out;
    case 'ticket_number_asc':
      // Sort by the user-visible execution badge (e.g. "1.4", "5") so the
      // ordering matches the prominent ticket label on each card. Cards
      // without wave/sequence (e.g. ad-hoc tickets) fall back to the
      // friendly_id numeric tail and sink to the end.
      out.sort((a, b) => {
        const ak = execSortKey(a);
        const bk = execSortKey(b);
        return compareNullable(ak, bk, compareExecKey);
      });
      return out;
    default:
      return out;
  }
}

type ExecSortKey = {
  /** Primary axis — wave index. */
  wave: number;
  /** Secondary axis — sequence within the wave. */
  seq: number;
  /** Tertiary tiebreaker — friendly_id numeric tail. */
  tail: number;
};

const compareExecKey = (x: ExecSortKey, y: ExecSortKey): number =>
  x.wave - y.wave || x.seq - y.seq || x.tail - y.tail;

function execSortKey(card: Card): ExecSortKey | null {
  const tail = friendlyIdTail(card);
  if (typeof card.wave === 'number') {
    return {
      wave: card.wave,
      seq: typeof card.sequence === 'number' ? card.sequence : 0,
      tail: tail ?? 0,
    };
  }
  if (tail !== null) {
    // Park unwaved cards after every waved one but ordered consistently by
    // their underlying ticket number.
    return { wave: Number.MAX_SAFE_INTEGER, seq: 0, tail };
  }
  return null;
}

function friendlyIdTail(card: Card): number | null {
  if (typeof card.number === 'number') return card.number;
  if (card.friendly_id) {
    const m = /-(\d+)$/.exec(card.friendly_id);
    if (m) return Number.parseInt(m[1]!, 10);
  }
  return null;
}
