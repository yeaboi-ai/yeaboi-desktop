// Fetching the paper. The one impure module in lib/news: it reaches the
// sidecar through the bridge and remembers the last paper for the next mount,
// so coming back to the home never paints blank.

import { apiGetOptional, apiPost } from '@/lib/yeaboi/api';
import type { Entry } from '@/lib/yeaboi/shell-changelog';
import type { NewsColumn, NewsProbe, NewsSourceRow, Paper } from './types';

/** How long after a stale paper to ask again; the backend refreshes meanwhile. */
export const STALE_RETRY_MS = 4_000;
/** How often a window coming back to the front can ask for a fresher paper. */
export const FOCUS_REFETCH_MS = 15 * 60 * 1000;

/** The paper, or null on a sidecar without the route. `refresh` asks the sidecar for a fresh one. */
export function loadPaper(opts: { refresh?: boolean } = {}): Promise<Paper | null> {
  return apiGetOptional<Paper>(opts.refresh ? '/api/news?refresh=1' : '/api/news');
}

/** The outlet roster, or null on a sidecar that does not keep one. */
export async function loadSources(): Promise<NewsSourceRow[] | null> {
  const loaded = await apiGetOptional<{ sources: NewsSourceRow[] }>('/api/news/sources');
  return loaded?.sources ?? null;
}

export function setSourceEnabled(id: string, enabled: boolean): Promise<{ source: NewsSourceRow }> {
  return apiPost(`/api/news/sources/${encodeURIComponent(id)}/enabled`, { enabled });
}

export function probeSource(url: string): Promise<NewsProbe> {
  return apiPost('/api/news/sources/probe', { url });
}

export function addSource(draft: {
  url: string;
  name: string;
  column: NewsColumn;
}): Promise<{ source: NewsSourceRow }> {
  return apiPost('/api/news/sources', draft);
}

export function removeSource(id: string): Promise<{ deleted: string }> {
  return apiPost(`/api/news/sources/${encodeURIComponent(id)}/delete`);
}

/** The backend's release ledger for the fallback paper; null when there is none. */
export async function loadFallbackNotes(): Promise<Entry[] | null> {
  const loaded = await apiGetOptional<{ entries: Entry[] }>('/api/meta/changelog');
  return loaded?.entries ?? null;
}

let remembered: Paper | null = null;

export function paperNow(): Paper | null {
  return remembered;
}

export function rememberPaper(paper: Paper): void {
  remembered = paper;
}

/** Whether enough time has passed since the last ask. Never asked counts as long enough. */
export function shouldRefetch(lastAt: number, now: number, every = FOCUS_REFETCH_MS): boolean {
  return lastAt <= 0 || now - lastAt >= every;
}
