// The paper as an edition: the stories in the order the one page turns
// through them, the lead first and then the three desks in turn, so two
// stories in a row are never from the same desk. The rest of the page's
// words live here too: the kicker naming the desk, and the button's label.

import {
  NEWS_COLUMNS,
  isNewsColumn,
  type NewsColumn,
  type NewsItem,
  type NewsSourceStatus,
  type Paper,
} from './types';

/** Stories the page turns through before it comes round again. */
export const EDITION_SIZE = 12;

/** The desk names as printed. "AI" is the one initialism the paper allows
 *  itself: it is the name of the beat. */
export const COLUMN_TITLES: Record<NewsColumn, string> = {
  yeaboi: 'yeaboi',
  ai: 'AI',
  engineering: 'Engineering',
};

/** The kicker over a headline: which desk it came from. */
export const KICKERS: Record<NewsColumn, string> = {
  yeaboi: 'From yeaboi',
  ai: 'From the AI desk',
  engineering: 'From the engineering desk',
};

export function kicker(item: Pick<NewsItem, 'column'>): string {
  return isNewsColumn(item.column) ? KICKERS[item.column] : '';
}

/** What the button does, in words: where the story opens. */
export function readMoreLabel(item: Pick<NewsItem, 'kind' | 'source_id' | 'source_name'>): string {
  if (item.kind === 'video') return 'Watch on YouTube';
  if (item.kind === 'release') return 'Read the release notes';
  if (item.source_id === 'yeaboi-site') return 'Read more on yeaboi.ai';
  return `Read more at ${item.source_name}`;
}

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function count(n: number): string {
  return SMALL[n] ?? String(n);
}

/** `Read from 14 outlets.`, `Read from 12 outlets, two not answering.`, or "" with none. */
export function sourcesLine(sources: NewsSourceStatus[]): string {
  if (sources.length === 0) return '';
  const ok = sources.filter((source) => source.ok).length;
  const down = sources.length - ok;
  const outlets = ok === 1 ? '1 outlet' : `${ok} outlets`;
  if (down === 0) return `Read from ${outlets}.`;
  return `Read from ${outlets}, ${count(down)} not answering.`;
}

export function isExternal(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** The edition in reading order: the lead, then the desks round-robin, each
 *  story once, capped. A desk the sidecar sends that the paper has no page
 *  for is left out. */
export function storiesOf(paper: Paper, opts: { size?: number } = {}): NewsItem[] {
  const size = opts.size ?? EDITION_SIZE;
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const take = (item: NewsItem) => {
    if (seen.has(item.id) || out.length >= size) return;
    seen.add(item.id);
    out.push(item);
  };
  if (paper.lead && isNewsColumn(paper.lead.column)) take(paper.lead);
  const queues = NEWS_COLUMNS.map((column) => [
    ...(paper.sections.find((s) => s.column === column)?.items ?? []),
  ]);
  let left = queues.reduce((n, q) => n + q.length, 0);
  while (left > 0 && out.length < size) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        left -= 1;
        take(next);
      }
    }
  }
  return out;
}

/** Whether the paper has anything to print at all. */
export function isEmpty(paper: Paper): boolean {
  const leadDrawn = Boolean(paper.lead && isNewsColumn(paper.lead.column));
  return !leadDrawn && paper.sections.every((s) => !isNewsColumn(s.column) || s.items.length === 0);
}
