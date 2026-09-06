// What a project can point at, and the pure half of the composer's @ menu:
// which sources to offer (from the connections catalog), where a trigger
// sits in the text, how a pick becomes a chip, and every sentence the menu
// says. The wire halves are the sidecar's /api/projects/references and the
// planning backend's `references` list and attachments routes
// (contracts/v1/app_http.md, backend/src/app/schemas/project.py). Pure, so
// test/references.test.ts pins it in the node lane.

import { apiGetOptional } from '@/lib/yeaboi/api';
import type { ConnectionRow } from '@/lib/yeaboi/connections';

/** One thing the project points at, as the planning backend stores it. */
export interface ProjectReference {
  /** The connector key (`jira`, `github`, `aws`), or `link`. */
  source: string;
  /** What is stored: `PROJ-123`, `owner/repo`, a page id, a typed subject, a URL. */
  subject: string;
  /** The words the chip shows. */
  label: string;
  url: string | null;
}

/** A screenshot on the project, as the detail GET lists it. */
export interface ProjectAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  /** Relative to the planning backend's origin; see attachmentSrc. */
  url: string;
  created_at: string;
}

/** A row on the menu's first level. */
export interface ReferenceSource {
  key: string;
  label: string;
  /** The mark: a connector key ICON_PATHS knows, or `link` / `screenshot`. */
  icon: string;
  family: string;
  accent: string;
  glyph: string;
  /** Whether the sidecar can list its items; otherwise the subject is typed. */
  searchable: boolean;
  kind: 'integration' | 'link' | 'screenshot';
}

/** One row the sidecar offers for a source. */
export interface ReferenceItem {
  id: string;
  subject: string;
  label: string;
  detail: string;
  url: string;
}

export interface ReferenceSearch {
  source: string;
  source_label: string;
  items: ReferenceItem[];
  warning: string;
}

export type Trigger = '@' | '/';

/** Where a trigger sits: the index of the `@` or `/`, and the word typed after it. */
export interface TriggerHit {
  start: number;
  trigger: Trigger;
  query: string;
}

/** The sources the sidecar's references route can list (its `SOURCES`). */
export const SEARCHABLE_SOURCES: ReadonlySet<string> = new Set([
  'jira',
  'github',
  'azure',
  'azdevops',
  'linear',
  'confluence',
  'notion',
]);

/** Connector keys whose sidecar source is spelled differently. */
const SOURCE_ALIASES: Record<string, string> = { azure: 'azdevops' };

/** Connector keys whose logomark ships under another name (provider-icon.tsx). */
const ICON_ALIASES: Record<string, string> = { azdevops: 'azure' };

/** The mark for a source or a stored reference's source key. */
export function iconFor(key: string): string {
  return ICON_ALIASES[key] ?? key;
}

export const LINK_SOURCE: ReferenceSource = {
  key: 'link',
  label: 'Link',
  icon: 'link',
  family: '',
  accent: '',
  glyph: '',
  searchable: false,
  kind: 'link',
};

export const SCREENSHOT_SOURCE: ReferenceSource = {
  key: 'screenshot',
  label: 'Screenshot',
  icon: 'screenshot',
  family: '',
  accent: '',
  glyph: '',
  searchable: false,
  kind: 'screenshot',
};

/** The sidecar source key for a connector key. */
export function sidecarSource(key: string): string {
  return SOURCE_ALIASES[key] ?? key;
}

/** Connector families that are not things a project points at. */
export const NOT_REFERENCE_FAMILIES: ReadonlySet<string> = new Set(['music', 'media']);

/** The menu's sources: every connected integration in catalog order (read
 *  with `loadConnections(true)`, the whole catalog, since the built-in
 *  integrations only appear there), then Link and Screenshot. An unknown
 *  connector is offered with a typed subject. */
export function referenceSources(
  rows: readonly Pick<
    ConnectionRow,
    'key' | 'label' | 'connected' | 'family' | 'accent' | 'glyph'
  >[],
): ReferenceSource[] {
  const connected = rows
    .filter((row) => row.connected && !NOT_REFERENCE_FAMILIES.has(row.family))
    .map((row): ReferenceSource => ({
      key: row.key,
      label: row.label,
      icon: iconFor(row.key),
      family: row.family,
      accent: row.accent,
      glyph: row.glyph,
      searchable: SEARCHABLE_SOURCES.has(row.key),
      kind: 'integration',
    }));
  return [...connected, LINK_SOURCE, SCREENSHOT_SOURCE];
}

/** The first level in the order the trigger implies: `/` leads with the two
 *  built-ins, `@` with the connections. */
export function menuSources(
  sources: readonly ReferenceSource[],
  trigger: Trigger,
  query = '',
): ReferenceSource[] {
  const ordered =
    trigger === '/'
      ? [
          ...sources.filter((s) => s.kind !== 'integration'),
          ...sources.filter((s) => s.kind === 'integration'),
        ]
      : [...sources];
  const q = query.trim().toLowerCase();
  return q ? ordered.filter((s) => s.label.toLowerCase().includes(q)) : ordered;
}

/** A trigger at the caret: `@` or `/` at the start of the text or after a
 *  space or punctuation, followed by an unbroken word. `https://` never
 *  qualifies, so a pasted URL opens nothing. */
export function triggerAt(text: string, caret: number): TriggerHit | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = /(^|[\s,.!?(])([@/])([^\s@/]*)$/.exec(before);
  if (!match) return null;
  const query = match[3] ?? '';
  return { start: before.length - query.length - 1, trigger: match[2] as Trigger, query };
}

/** The text with the trigger word taken out, and where the caret lands. */
export function removeTrigger(
  text: string,
  hit: TriggerHit,
  caret: number,
): { text: string; caret: number } {
  const end = Math.max(hit.start + 1 + hit.query.length, Math.min(caret, text.length));
  let head = text.slice(0, hit.start);
  const tail = text.slice(end).replace(/^ /, '');
  if (!tail) head = head.replace(/\s+$/, '');
  return { text: head + tail, caret: head.length };
}

export function chipLabel(ref: Pick<ProjectReference, 'label' | 'subject'>): string {
  return ref.label || ref.subject;
}

/** The reference a typed subject makes on a source with no reader. */
export function typedReference(source: ReferenceSource, typed: string): ProjectReference {
  const subject = typed.trim().replace(/\s+/g, ' ');
  return { source: source.key, subject, label: `${source.label} ${subject}`.trim(), url: null };
}

/** The reference a picked row makes. */
export function pickedReference(source: ReferenceSource, item: ReferenceItem): ProjectReference {
  return { source: source.key, subject: item.subject, label: item.label, url: item.url || null };
}

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** A link chip: labelled by its host and path, never the scheme. */
export function linkReference(url: string): ProjectReference {
  const clean = url.trim();
  let label = clean.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  try {
    const parsed = new URL(clean);
    label = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    // keep the stripped text
  }
  return { source: 'link', subject: clean, label, url: clean };
}

/** Whether two references are the same thing. */
export function sameReference(a: ProjectReference, b: ProjectReference): boolean {
  return a.source === b.source && a.subject === b.subject;
}

/** An attachment's fetchable src: the backend answers a path relative to its
 *  own origin, which the renderer must prefix. */
export function attachmentSrc(apiUrl: string, url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${apiUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const SCREENSHOT_MIMES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
export const SCREENSHOT_ACCEPT = SCREENSHOT_MIMES.join(',');
export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const SCREENSHOT_MAX_COUNT = 6;

/** Whether a file can be a screenshot here, or why not. */
export function screenshotVerdict(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true } | { refusal: string } {
  if (!SCREENSHOT_MIMES.includes(file.type.toLowerCase()))
    return { refusal: `${file.name} is not a PNG, JPEG, WebP or GIF image.` };
  if (file.size === 0) return { refusal: `${file.name} is empty.` };
  if (file.size > SCREENSHOT_MAX_BYTES) return { refusal: `${file.name} is over 8 MB.` };
  return { ok: true };
}

/** The sidecar's rows for a source; null when the sidecar predates the route. */
export async function loadReferenceItems(
  source: string,
  q: string,
  limit = 8,
): Promise<ReferenceSearch | null> {
  const params = new URLSearchParams({ source: sidecarSource(source), q, limit: String(limit) });
  return apiGetOptional<ReferenceSearch>(`/api/projects/references?${params.toString()}`);
}

/** Every sentence the menu and the chips say. */
export const REFERENCE_COPY = {
  ADD_HEADING: 'Add to this project',
  LINK_HINT: 'Paste a URL',
  LINK_PLACEHOLDER: 'https://',
  SCREENSHOT_HINT: 'Choose an image, or paste one',
  LOOKING: 'Looking…',
  NOTHING: 'Nothing by that name.',
  FAILED: 'Could not search right now.',
  BAD_URL: 'That needs to start with http:// or https://.',
  COMPOSER_HINT: '@ adds a link, a ticket or a screenshot.',
  TOO_MANY_SHOTS: `${SCREENSHOT_MAX_COUNT} screenshots is the most a project takes.`,
  DROP_LABEL: 'Drop the screenshot here',
  NOT_ATTACHED_TITLE: 'Screenshots not attached',
  searchPlaceholder: (label: string) => `Search ${label}`,
  useTyped: (typed: string) => `Use “${typed}”`,
  noReader: (label: string) => `Name the ${label} item.`,
  notAttached: (names: readonly string[]) =>
    `The project was created, but ${names.join(', ')} could not be attached.`,
  removeLabel: (label: string) => `Remove ${label}`,
} as const;
