// A context scope — what a run may read from the runs before it — as pure
// rules: its JSON twin on the wire, the window presets, the chip toggles, the
// tags, and the one-line summaries the picker shows. Mirrors the engine's
// yeaboi.context.scope (sources, window, project labels, tags, limits).

export const SOURCES = [
  'plan',
  'standup',
  'retro',
  'poker',
  'performance',
  'analysis',
  'reporting',
  'review',
] as const;

export type Source = (typeof SOURCES)[number];

/** The plural the summaries count in. */
export const SOURCE_PLURALS: Record<Source, string> = {
  plan: 'plans',
  standup: 'standups',
  retro: 'retros',
  poker: 'poker sessions',
  performance: 'performance notes',
  analysis: 'analyses',
  reporting: 'reports',
  review: 'weekly reviews',
};

export type WindowKind = 'all' | 'sprints' | 'month' | 'quarter' | 'year' | 'custom';

export interface ScopeWindow {
  kind: WindowKind;
  /** Sprints only. */
  count?: number;
  /** Custom only, ISO dates; `end` empty means today. */
  start?: string;
  end?: string;
}

export interface ContextScope {
  /** null = every source; [] = incognito. */
  sources: string[] | null;
  window: ScopeWindow;
  /** Project labels, any of. */
  projects: string[];
  /** Tags, all of. */
  tags: string[];
  /** Per-source cap on the newest N. */
  limits: Record<string, number>;
}

export interface ContextOptions {
  sources: { key: string; label: string; hint: string; count: number }[];
  windows: { kind: WindowKind; label: string; needs_count: boolean; needs_range: boolean }[];
  projects: string[];
  tags: { tag: string; count: number }[];
  calendar?: {
    source: string;
    length_weeks: number;
    anchor_date: string;
    current: { number: number | null; start: string; end: string };
  };
  /** The mode's saved or last-used scope. */
  default: ContextScope | null;
  /** The tags the run will carry whatever else is chosen. */
  defaults: { tags: string[] };
}

export interface ContextPreview {
  scope: ContextScope;
  window: { start: string; end: string; label: string };
  summary: string;
  sources: {
    key: string;
    count: number;
    rows?: {
      session_id: string;
      run_id: string;
      title: string;
      date: string;
      project_label: string;
      tags: string[];
    }[];
  }[];
  warnings: string[];
}

export interface WindowPreset {
  key: string;
  label: string;
}

export const WINDOW_PRESETS: readonly WindowPreset[] = [
  { key: 'all', label: 'Everything' },
  { key: 'sprints:1', label: 'Last sprint' },
  { key: 'sprints:2', label: 'Last 2 sprints' },
  { key: 'month', label: 'Last month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

export const ALL_WINDOW: ScopeWindow = { kind: 'all' };

/** The scope a picker starts from: everything on, no window, the mode's default tags. */
export function defaultScope(
  options: Pick<ContextOptions, 'default' | 'defaults'> | null,
): ContextScope {
  if (options?.default) return withDefaultTags(options.default, options.defaults?.tags ?? []);
  return {
    sources: null,
    window: ALL_WINDOW,
    projects: [],
    tags: [...(options?.defaults?.tags ?? [])],
    limits: {},
  };
}

function withDefaultTags(scope: ContextScope, defaults: readonly string[]): ContextScope {
  const tags = new Set([...defaults, ...scope.tags]);
  return { ...scope, tags: [...tags] };
}

export function isIncognito(scope: ContextScope): boolean {
  return scope.sources !== null && scope.sources.length === 0;
}

export function wantsSource(scope: ContextScope, source: string): boolean {
  return scope.sources === null || scope.sources.includes(source);
}

/**
 * Flip one source. "Every source" materialises to the full list first, so
 * switching one off leaves the others explicitly on; the order stays the
 * engine's, and switching the last one off is incognito.
 */
export function toggleSource(
  scope: ContextScope,
  source: string,
  all: readonly string[] = SOURCES,
): ContextScope {
  const current = new Set(scope.sources === null ? all : scope.sources);
  if (current.has(source)) current.delete(source);
  else current.add(source);
  return { ...scope, sources: all.filter((key) => current.has(key)) };
}

export function allSources(scope: ContextScope): ContextScope {
  return { ...scope, sources: null };
}

export function noSources(scope: ContextScope): ContextScope {
  return { ...scope, sources: [] };
}

/** The window a preset key names; `custom` takes the two dates. */
export function windowFromKey(key: string, custom?: { start: string; end: string }): ScopeWindow {
  const [kind, count] = key.split(':');
  switch (kind) {
    case 'sprints':
      return { kind: 'sprints', count: Math.max(1, Number(count) || 1) };
    case 'month':
    case 'quarter':
    case 'year':
      return { kind };
    case 'custom':
      return { kind: 'custom', start: custom?.start ?? '', end: custom?.end ?? '' };
    default:
      return ALL_WINDOW;
  }
}

/** The preset key a window answers to. */
export function windowKey(window: ScopeWindow): string {
  if (window.kind === 'sprints') return `sprints:${Math.max(1, window.count ?? 1)}`;
  return window.kind;
}

/** A tag as the engine stores it: trimmed, lower-case, spaces as hyphens, at most forty characters. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 40);
}

export function addTag(scope: ContextScope, tag: string): ContextScope {
  const clean = normalizeTag(tag);
  if (!clean || scope.tags.includes(clean)) return scope;
  return { ...scope, tags: [...scope.tags, clean] };
}

/** Remove a tag the reader added; a default tag stays, whatever is asked. */
export function removeTag(
  scope: ContextScope,
  tag: string,
  defaults: readonly string[] = [],
): ContextScope {
  if (defaults.includes(tag)) return scope;
  return { ...scope, tags: scope.tags.filter((existing) => existing !== tag) };
}

export function setProject(scope: ContextScope, label: string): ContextScope {
  const clean = label.trim();
  return { ...scope, projects: clean ? [clean] : [] };
}

/** The `context` key of a run body — the engine's JSON twin, verbatim. */
export function serializeScope(scope: ContextScope): ContextScope {
  const window: ScopeWindow = { kind: scope.window.kind };
  if (scope.window.kind === 'sprints') window.count = Math.max(1, scope.window.count ?? 1);
  if (scope.window.kind === 'custom') {
    window.start = scope.window.start ?? '';
    window.end = scope.window.end ?? '';
  }
  return {
    sources: scope.sources === null ? null : [...scope.sources],
    window,
    projects: [...scope.projects],
    tags: [...scope.tags],
    limits: { ...scope.limits },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "4 Aug" from an ISO date; the string itself when it is not one. */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}`;
}

/** The window in words: what the picker's select says, or the dates. */
export function windowLabel(window: ScopeWindow): string {
  if (window.kind === 'custom') {
    const start = window.start ? shortDate(window.start) : '';
    const end = window.end ? shortDate(window.end) : 'today';
    return start ? `${start} to ${end}` : 'everything';
  }
  return (
    WINDOW_PRESETS.find((preset) => preset.key === windowKey(window))?.label ?? 'Everything'
  ).toLowerCase();
}

/**
 * One line saying what the scope reads: the sources, the window, the project,
 * the tags — commas between them, nothing else.
 */
export function scopeSummary(
  scope: ContextScope,
  labels: readonly { key: string; label: string }[] = [],
): string {
  const parts: string[] = [];
  if (scope.sources === null) parts.push('All sources');
  else if (scope.sources.length === 0) parts.push('No other sessions');
  else {
    const names = scope.sources.map(
      (key) => labels.find((source) => source.key === key)?.label.toLowerCase() ?? key,
    );
    parts.push(names.join(', '));
  }
  if (!isIncognito(scope)) parts.push(windowLabel(scope.window));
  if (scope.projects.length) parts.push(`project ${scope.projects.join(', ')}`);
  if (scope.tags.length)
    parts.push(scope.tags.length === 1 ? '1 tag' : `${scope.tags.length} tags`);
  return parts.join(', ');
}

/** What the preview found: "12 standups, 2 retros, 4 Aug to 11 Sep". */
export function previewLine(preview: Pick<ContextPreview, 'sources' | 'window'>): string {
  const counts = preview.sources
    .filter((source) => source.count > 0)
    .map((source) => {
      const plural = (SOURCE_PLURALS as Record<string, string>)[source.key] ?? source.key;
      const word = source.count === 1 ? plural.replace(/ies$/, 'y').replace(/s$/, '') : plural;
      return `${source.count} ${word}`;
    });
  if (counts.length === 0) return 'Nothing to read in this window';
  const range =
    preview.window.start && preview.window.end
      ? `${shortDate(preview.window.start)} to ${shortDate(preview.window.end)}`
      : '';
  return [...counts, ...(range ? [range] : [])].join(', ');
}

/** The tags the reader added on top of the mode's defaults. */
export function customTags(scope: ContextScope, defaults: readonly string[] = []): string[] {
  return scope.tags.filter((tag) => !defaults.includes(tag));
}

/** The tags a reader typed, without the engine's `key:value` stamps and month marks. */
export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !tag.includes(':') && !/^\d{4}-\d{2}$/.test(tag));
}

/**
 * The three keys a run body carries once a scope was chosen. Nothing when the
 * sidecar has no context routes, so an older engine sees the body it always saw.
 */
export function runBody(scope: ContextScope | null, available: boolean): Record<string, unknown> {
  if (!available || !scope) return {};
  const body: Record<string, unknown> = { context: serializeScope(scope), tags: [...scope.tags] };
  const project = scope.projects[0]?.trim();
  if (project) body['project_label'] = project;
  return body;
}

/** A scope as the sidecar returns it on a session, made safe: an unknown or
 *  malformed value falls back to the mode's default. */
export function scopeFromWire(raw: unknown, options: ContextOptions | null): ContextScope {
  const fallback = defaultScope(options);
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, unknown>;
  const sources =
    source['sources'] === null
      ? null
      : Array.isArray(source['sources'])
        ? source['sources'].filter((s): s is string => typeof s === 'string')
        : fallback.sources;
  const window = source['window'] as Partial<ScopeWindow> | undefined;
  const kinds: WindowKind[] = ['all', 'sprints', 'month', 'quarter', 'year', 'custom'];
  const kind = window && kinds.includes(window.kind as WindowKind) ? window!.kind! : 'all';
  const tags = Array.isArray(source['tags'])
    ? source['tags'].filter((t): t is string => typeof t === 'string')
    : [];
  const projects = Array.isArray(source['projects'])
    ? source['projects'].filter((p): p is string => typeof p === 'string')
    : [];
  const limits =
    source['limits'] && typeof source['limits'] === 'object'
      ? Object.fromEntries(
          Object.entries(source['limits'] as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : {};
  return {
    sources,
    window: {
      kind,
      ...(typeof window?.count === 'number' ? { count: window.count } : {}),
      ...(typeof window?.start === 'string' ? { start: window.start } : {}),
      ...(typeof window?.end === 'string' ? { end: window.end } : {}),
    },
    projects,
    tags: [...new Set([...(options?.defaults?.tags ?? []), ...tags])],
    limits,
  };
}
