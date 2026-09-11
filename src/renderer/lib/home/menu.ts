// The home's mode menu, as pure rules: which cards it shows, how the arrow
// keys walk them, and how the Recent list narrows to one mode. The cards are
// /api/meta/capabilities verbatim (the terminal's own menu), so the two
// surfaces cannot disagree about what there is to run. Pure
// (test/home-menu.test.ts); the components draw what these return.

import { menuFor, type Capabilities, type ModeCard } from '@/lib/yeaboi/capabilities';
import { cardKeyForMode, type ShapedSession } from '@/lib/yeaboi/sessions';

/** Cards the menu does not draw: the rail's foot is already Settings. */
export const MENU_HIDDEN: ReadonlySet<string> = new Set(['settings']);

/** The filter key that shows every mode. */
export const ALL_MODES = 'all';

export type MenuKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export interface RecentFilter {
  key: string;
  title: string;
}

/** The world's cards in the terminal's order, minus the ones the menu hides. */
export function menuCards(caps: Capabilities, audience: string): ModeCard[] {
  return menuFor(caps, audience).filter((card) => !MENU_HIDDEN.has(card.key));
}

/**
 * Where a key moves the focused card. Left and Right step by one; Up and Down
 * step by a row, which is `columns` cards wide; both stop at the ends rather
 * than wrapping, so the last card is never one press from the first.
 */
export function menuMove(index: number, key: MenuKey, count: number, columns: number): number {
  if (count <= 0) return 0;
  const last = count - 1;
  const row = Math.max(1, columns);
  const clamp = (next: number) => Math.min(last, Math.max(0, next));
  switch (key) {
    case 'ArrowLeft':
      return clamp(index - 1);
    case 'ArrowRight':
      return clamp(index + 1);
    case 'ArrowUp':
      return clamp(index - row);
    case 'ArrowDown':
      return clamp(index + row);
    case 'Home':
      return 0;
    case 'End':
      return last;
  }
}

/** The mode card key a shaped run belongs to. */
export function modeKeyOf(row: ShapedSession): string {
  return cardKeyForMode(row.session.mode);
}

/**
 * The filters the Recent list offers: every mode, then only the modes that
 * have run, in card order — a word for a mode with nothing to show is a word
 * that does nothing.
 */
export function recentFilters(
  cards: readonly { key: string; title: string }[],
  rows: readonly ShapedSession[],
): RecentFilter[] {
  const present = new Set(rows.map(modeKeyOf));
  return [
    { key: ALL_MODES, title: 'All' },
    ...cards.filter((card) => present.has(card.key)).map(({ key, title }) => ({ key, title })),
  ];
}

/** The rows one filter keeps; an unknown key keeps everything. */
export function filterRecent(rows: readonly ShapedSession[], key: string): ShapedSession[] {
  if (key === ALL_MODES || !rows.some((row) => modeKeyOf(row) === key)) return [...rows];
  return rows.filter((row) => modeKeyOf(row) === key);
}
