// How long ago a headline ran, in the paper's voice: minutes and hours today,
// weekday names this week, a date beyond that. Locale pinned to en-GB like
// every other date in the app.

import type { NewsItem } from './types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `4 Sep`, or `4 Sep 2025` when the year is not this one. */
export function shortDate(date: Date, now: Date): string {
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/** An unparseable stamp comes back as is; an empty one as "". */
export function relativeTime(iso: string, now: Date): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) {
    const ago = Math.max(0, now.getTime() - date.getTime());
    if (ago < MINUTE_MS) return 'just now';
    if (ago < HOUR_MS) {
      const minutes = Math.floor(ago / MINUTE_MS);
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    }
    const hours = Math.floor(ago / HOUR_MS);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return WEEKDAYS[date.getDay()]!;
  return shortDate(date, now);
}

/** `Techmeme, 2 hours ago`, or the outlet alone when the time is unknown. */
export function byline(item: Pick<NewsItem, 'source_name' | 'published'>, now: Date): string {
  const when = relativeTime(item.published, now);
  return when ? `${item.source_name}, ${when}` : item.source_name;
}
