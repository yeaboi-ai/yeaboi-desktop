// The paper when there is no /api/news: an older sidecar, or none. The yeaboi
// column is the two release ledgers, the same merge What's New draws.

import {
  desktopBackendEntries,
  entryHeadline,
  mergeChangelogs,
  type Entry,
  type MergedEntry,
} from '@/lib/yeaboi/shell-changelog';
import type { NewsItem, Paper } from './types';

/** Where a release row opens: the wheel on PyPI, the app on the site's
 *  page for it. */
export const BACKEND_RELEASE_URL = 'https://pypi.org/project/yeaboi/{version}/';
export const APP_RELEASE_URL = 'https://yeaboi.ai/desktop.html';

function releaseItem(entry: MergedEntry): NewsItem {
  const app = entry.channel === 'app';
  return {
    id: `release:${entry.channel}:${entry.version}`,
    title: `${app ? 'yeaboi for Mac' : 'yeaboi'} ${entry.version}: ${entryHeadline(entry)}`,
    url: app ? APP_RELEASE_URL : BACKEND_RELEASE_URL.replace('{version}', entry.version),
    source_id: app ? 'app-changelog' : 'yeaboi-changelog',
    source_name: app ? 'yeaboi for Mac' : 'yeaboi',
    published: entry.date ? `${entry.date}T00:00:00` : '',
    summary: entry.summary,
    image_url: null,
    kind: 'release',
    topic: 'models',
    persona: 'wizard',
    column: 'yeaboi',
  };
}

/** A paper from the release notes alone: never stale, never enabled, no lead. */
export function fallbackPaper(shell: Entry[], backend: Entry[] | null, now: Date): Paper {
  const items = mergeChangelogs(desktopBackendEntries(backend ?? []), shell).map(releaseItem);
  return {
    enabled: false,
    generated_at: now.toISOString(),
    stale: false,
    lead: null,
    sections: items.length > 0 ? [{ column: 'yeaboi', title: 'yeaboi', items }] : [],
    sources: [],
  };
}
