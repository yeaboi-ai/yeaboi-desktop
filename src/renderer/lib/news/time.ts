// How long ago a headline ran, in the paper's voice: minutes and hours today,
// weekday names this week, a date beyond that. The ladder itself is shared
// with the settings chips — see lib/relative-time.ts.

import { relativeTime, shortDate } from '../relative-time';
import type { NewsItem } from './types';

export { relativeTime, shortDate };

/** `Techmeme, 2 hours ago`, or the outlet alone when the time is unknown. */
export function byline(item: Pick<NewsItem, 'source_name' | 'published'>, now: Date): string {
  const when = relativeTime(item.published, now);
  return when ? `${item.source_name}, ${when}` : item.source_name;
}
