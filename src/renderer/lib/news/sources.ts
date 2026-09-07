// The outlets as the page names them: the tag on a story, the list in
// Settings, and what a row says about its last read.

import { COLUMN_TITLES } from './paper';
import { relativeTime } from './time';
import {
  NEWS_COLUMNS,
  isNewsColumn,
  type NewsItem,
  type NewsSourceRow,
  type NewsSourceStatus,
} from './types';

export interface SourceTag {
  label: string;
  /** The outlet's home page, or "" when the page has none to offer. */
  href: string;
}

/** The tag a story wears: the outlet's name, linking home when the paper knows where that is. */
export function tagFor(
  item: Pick<NewsItem, 'source_id' | 'source_name'>,
  sources: readonly Pick<NewsSourceStatus, 'id' | 'home_url'>[],
): SourceTag {
  const label = item.source_name || 'yeaboi';
  const home = sources.find((source) => source.id === item.source_id)?.home_url ?? '';
  return { label, href: /^https:\/\//.test(home) ? home : '' };
}

export interface Desk {
  column: string;
  title: string;
  rows: NewsSourceRow[];
}

/** The rows by desk, in page order; the built-ins first as the registry lists them, then the added ones. */
export function groupByDesk(rows: readonly NewsSourceRow[]): Desk[] {
  return NEWS_COLUMNS.map((column) => ({
    column,
    title: COLUMN_TITLES[column],
    rows: [
      ...rows.filter((row) => row.column === column && row.builtin),
      ...rows.filter((row) => row.column === column && !row.builtin),
    ],
  })).filter((desk) => desk.rows.length > 0);
}

/** One line under an outlet's name, saying how its last read went. */
export function healthLine(
  row: Pick<NewsSourceRow, 'enabled' | 'ok' | 'fetched_at' | 'error' | 'item_count'>,
  now: Date,
): string {
  if (!row.enabled) return 'Off';
  if (row.ok === null) return 'Not read yet';
  if (!row.ok) return row.error ? `Could not read it: ${row.error}` : 'Could not read it';
  const stories = row.item_count === 1 ? '1 story' : `${row.item_count} stories`;
  const when = relativeTime(row.fetched_at, now);
  return when ? `${stories}, ${when}` : stories;
}

export const NAME_MAX = 60;

/** What stops a draft outlet being added, in words; the sidecar checks the rest. */
export function draftProblems(draft: { url: string; name: string; column: string }): string[] {
  const problems: string[] = [];
  if (!draft.url.trim().startsWith('https://'))
    problems.push('The address must start with https://');
  const name = draft.name.trim();
  if (name.length < 1 || name.length > NAME_MAX)
    problems.push(`The name needs 1 to ${NAME_MAX} characters`);
  if (!isNewsColumn(draft.column)) problems.push('Pick a desk');
  return problems;
}
