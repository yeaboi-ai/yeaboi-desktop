// The rest of the edition: what a reader sees at the foot of the sheet, and
// where a click on it takes them.

import type { NewsItem } from './types';

export const INSIDE_TITLE = 'Inside this edition';

export interface InsideLine {
  index: number;
  /** The story's place in the edition as the counter prints it: 1-based. */
  page: number;
  item: NewsItem;
}

/** Every story but the one that is up, in edition order. Nothing with fewer than two others. */
export function insideLines(stories: readonly NewsItem[], current: number): InsideLine[] {
  if (stories.length <= 2) return [];
  return stories
    .map((item, index) => ({ index, page: index + 1, item }))
    .filter((line) => line.index !== current);
}

/** The folded line: the title alone when open, else the title and how many stories are behind it. */
export function insideLabel(open: boolean, count: number): string {
  if (open) return INSIDE_TITLE;
  return `${INSIDE_TITLE}, ${count} more ${count === 1 ? 'story' : 'stories'}`;
}
