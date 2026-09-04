// The masthead's words: the name, the dateline, the volume and the edition line.

import { relativeTime } from './time';
import type { Paper } from './types';

export const MASTHEAD_WORD = 'yeaboi';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `Friday, 4 September 2026`. */
export function dateline(now: Date): string {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export type Edition =
  { kind: 'fresh'; generatedAt: string } | { kind: 'stale' } | { kind: 'offline' };

/** What the paper in hand is: fresh, being refreshed, or the last one kept. */
export function editionOf(paper: Paper | null, failed: boolean): Edition {
  if (!paper || failed || !paper.enabled) return { kind: 'offline' };
  if (paper.stale) return { kind: 'stale' };
  return { kind: 'fresh', generatedAt: paper.generated_at };
}

export function editionLine(edition: Edition, now: Date): string {
  switch (edition.kind) {
    case 'fresh': {
      const when = relativeTime(edition.generatedAt, now);
      return when ? `Refreshed ${when}.` : 'Refreshed.';
    }
    case 'stale':
      return 'Refreshing.';
    case 'offline':
      return 'Offline, showing the last paper.';
  }
}

/** The words on the folio's refresh button; nothing while a refresh runs or the sidecar is away. */
export function refreshLabel(edition: Edition): string {
  return edition.kind === 'fresh' ? 'Refresh now.' : '';
}

/** `Vol. 4, No. 1` from the shell's own version; "" when it does not parse. */
export function volumeLine(version: string): string {
  const match = /^(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return '';
  return `Vol. ${Number(match[1])}, No. ${Number(match[2])}`;
}
