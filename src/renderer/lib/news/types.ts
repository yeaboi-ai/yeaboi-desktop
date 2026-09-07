// The front page's wire, as GET /api/news serves it (contracts/v1/app_http.md
// in yeaboi.ai, "The front page"). Every field is the backend's; the renderer
// adds nothing and validates the one it draws art from.

export type NewsColumn = 'yeaboi' | 'ai' | 'engineering';

/** Page order, and the only columns the paper draws; anything else a sidecar sends is skipped. */
export const NEWS_COLUMNS: readonly NewsColumn[] = ['yeaboi', 'ai', 'engineering'];

export type NewsKind = 'article' | 'video' | 'release' | 'post';

export type NewsTopic =
  | 'security'
  | 'policy'
  | 'compute'
  | 'media'
  | 'models'
  | 'research'
  | 'tooling'
  | 'howto'
  | 'general';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source_id: string;
  source_name: string;
  /** ISO 8601 with an offset, or "" when the outlet gave none. */
  published: string;
  /** The outlet's own teaser, plain text, at most 240 characters. */
  summary: string;
  /** The outlet's picture; never drawn here (the renderer loads no remote images). */
  image_url: string | null;
  kind: NewsKind | string;
  topic: NewsTopic | string;
  /** One of the eight persona ids; checked with isPersonaId before it picks art. */
  persona?: string | null;
  column: NewsColumn | string;
}

export interface NewsSection {
  column: NewsColumn | string;
  title: string;
  items: NewsItem[];
}

export interface NewsSourceStatus {
  id: string;
  name: string;
  home_url: string;
  column: string;
  ok: boolean;
  fetched_at: string;
  error: string;
  item_count: number;
}

export interface Paper {
  /** False when YEABOI_NEWS is off: the yeaboi column only, nothing fetched. */
  enabled: boolean;
  /** True while the backend refreshes an expired paper in the background. */
  refreshing?: boolean;
  schema?: number;
  generated_at: string;
  /** True when this is the cached paper and a fresher one is on its way. */
  stale: boolean;
  lead: NewsItem | null;
  sections: NewsSection[];
  sources: NewsSourceStatus[];
}

/** One row of GET /api/news/sources: an outlet the roster knows, and how its last read went. */
export interface NewsSourceRow {
  id: string;
  name: string;
  home_url: string;
  url: string;
  column: NewsColumn | string;
  kind: string;
  /** False for an outlet the user added; only those can be removed. */
  builtin: boolean;
  enabled: boolean;
  /** Null when the outlet has not been read yet. */
  ok: boolean | null;
  fetched_at: string;
  error: string;
  item_count: number;
}

/** POST /api/news/sources/probe: one look at a URL before it becomes an outlet. */
export interface NewsProbe {
  ok: boolean;
  url: string;
  /** Set when the URL was a web page that advertises a feed. */
  feed_url: string;
  kind: string;
  name: string;
  home_url: string;
  item_count: number;
  sample_titles: string[];
  error: string;
}

export function isNewsColumn(value: string): value is NewsColumn {
  return (NEWS_COLUMNS as readonly string[]).includes(value);
}
