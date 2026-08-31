// The feedback form's decisions, kept out of the component so the paths a person
// only reaches by accident — a 6 MB screenshot, a .zip, a title long enough to
// be clipped — are pinned by tests rather than found in the wild.
//
// `issueTitle` and `issueLabels` mirror feedback.py's `issue_title` and
// `issue_labels`. They are duplicated rather than fetched because the filing
// slip has to show them on every keystroke, and both are one line that the
// backend contract fixes; `test/feedback.test.ts` is what notices a drift.

export type AttachmentKind = 'image' | 'text';

/** What GET /api/feedback/options serves: the vocabularies, the caps, and the route. */
export interface FeedbackOptions {
  types: string[];
  areas: string[];
  repo: string;
  area_colors?: Record<string, string>;
  version?: string;
  platform?: string;
  has_github_token?: boolean;
  image_mimes?: string[];
  text_mimes?: string[];
  max_image_bytes?: number;
  max_text_bytes?: number;
  max_attachments?: number;
}

/** One file the backend has already stored, as the form holds it. */
export interface Attachment {
  path: string;
  name: string;
  kind: AttachmentKind;
  bytes: number;
  lines?: number;
  /** An object URL for the thumbnail. Images only, and revoked on removal. */
  preview?: string;
}

// Stand-ins for a backend that predates the extended options payload. The caps
// are the backend's own; guessing low would refuse files it would have taken.
const DEFAULT_IMAGE_MIMES = ['image/png', 'image/jpeg'];
const DEFAULT_TEXT_MIMES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
const DEFAULT_MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const DEFAULT_MAX_TEXT_BYTES = 128 * 1024;
const DEFAULT_MAX_ATTACHMENTS = 6;

/** Extensions a browser hands us with an empty or wrong `File.type`. */
const TEXT_EXTENSIONS = ['.log', '.txt', '.md', '.csv', '.json'];

const MAX_TITLE_CHARS = 250;

export function imageMimes(options: FeedbackOptions): string[] {
  return options.image_mimes ?? DEFAULT_IMAGE_MIMES;
}

export function textMimes(options: FeedbackOptions): string[] {
  return options.text_mimes ?? DEFAULT_TEXT_MIMES;
}

export function maxAttachments(options: FeedbackOptions): number {
  return options.max_attachments ?? DEFAULT_MAX_ATTACHMENTS;
}

/** What `<input type="file">` should offer, from the backend's own vocabulary. */
export function acceptAttribute(options: FeedbackOptions): string {
  return [...imageMimes(options), ...textMimes(options), ...TEXT_EXTENSIONS].join(',');
}

/** A size a person reads, not a byte count. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The mime to send for a file, falling back to its extension.
 *
 *  A `.log` dragged from Finder arrives with an empty `type`, and a `.md` often
 *  arrives as `text/markdown` on one platform and `text/plain` on another. */
export function mimeFor(file: { name: string; type: string }, options: FeedbackOptions): string {
  const declared = file.type.split(';')[0].trim().toLowerCase();
  if (imageMimes(options).includes(declared) || textMimes(options).includes(declared))
    return declared;
  const lower = file.name.toLowerCase();
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    if (lower.endsWith('.json') && textMimes(options).includes('application/json'))
      return 'application/json';
    if (lower.endsWith('.csv') && textMimes(options).includes('text/csv')) return 'text/csv';
    if (lower.endsWith('.md') && textMimes(options).includes('text/markdown'))
      return 'text/markdown';
    return 'text/plain';
  }
  return declared;
}

export type Classified = { kind: AttachmentKind; mime: string } | { refusal: string };

/** Whether a dropped file can be attached, or the sentence explaining why not.
 *
 *  The refusal is shown to the person verbatim, so it says what happened and
 *  what would work instead. */
export function classifyFile(
  file: { name: string; type: string; size: number },
  options: FeedbackOptions,
): Classified {
  const mime = mimeFor(file, options);
  const kind: AttachmentKind | null = imageMimes(options).includes(mime)
    ? 'image'
    : textMimes(options).includes(mime)
      ? 'text'
      : null;
  if (!kind) return { refusal: `${file.name} — attach a PNG, a JPEG, or a text file like a log.` };

  const ceiling =
    kind === 'image'
      ? (options.max_image_bytes ?? DEFAULT_MAX_IMAGE_BYTES)
      : (options.max_text_bytes ?? DEFAULT_MAX_TEXT_BYTES);
  if (file.size > ceiling)
    return {
      refusal: `${file.name} is ${formatBytes(file.size)} — ${formatBytes(ceiling)} is the most this form takes.`,
    };
  if (file.size === 0) return { refusal: `${file.name} is empty.` };
  return { kind, mime };
}

/** The title as GitHub will show it. Mirrors feedback.py's `issue_title`. */
export function issueTitle(kind: string, title: string): string {
  return `[${kind}] ${title.trim()}`.slice(0, MAX_TITLE_CHARS);
}

/** Mirrors feedback.py's `issue_labels`. GitHub drops these without triage rights. */
export function issueLabels(kind: string, area: string): string[] {
  return [`type:${kind.toLowerCase()}`, `area:${area}`];
}

/** Submit does one of two things, so the button says which one. */
export function submitLabel(hasToken: boolean | undefined): string {
  return hasToken ? 'File the issue' : 'Open the issue form';
}

/** The one sentence the filing slip ends on: where this is about to go. */
export function routeSentence(options: FeedbackOptions): string {
  return options.has_github_token
    ? 'Filed through the GitHub API under your token, as you.'
    : 'Opens a pre-filled issue form in your browser. You press Submit there.';
}

/** "2 screenshots · 1 log", or empty when nothing is attached. */
export function attachmentSummary(attachments: Attachment[]): string {
  const images = attachments.filter((a) => a.kind === 'image').length;
  const texts = attachments.length - images;
  const parts: string[] = [];
  if (images) parts.push(`${images} screenshot${images === 1 ? '' : 's'}`);
  if (texts) parts.push(`${texts} file${texts === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The two path lists the submit and polish calls carry. */
export function attachmentPaths(attachments: Attachment[]): {
  image_paths: string[];
  text_paths: string[];
} {
  return {
    image_paths: attachments.filter((a) => a.kind === 'image').map((a) => a.path),
    text_paths: attachments.filter((a) => a.kind === 'text').map((a) => a.path),
  };
}
