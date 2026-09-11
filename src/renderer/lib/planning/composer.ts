// The New plan composer's words and the hand-off to the room, pure. The
// composer says what becomes of a description; the stash carries the
// screenshots pasted before the plan existed into its first turn, since the
// engine attaches an image to a turn by its chip and the opening turn is the
// room's to send.

export interface ComposerNote {
  lead: string;
  tail: string;
}

export const COMPOSER_COPY = {
  /** Under the empty composer, before a word is typed. */
  RESTING_LEAD: 'A first description is enough',
  RESTING_TAIL: 'you build on it in the conversation.',
  /** Under the composer once there are words. */
  NAMING_LEAD: 'yeaboi names the plan from this and opens with it',
  CREATE: 'Start the plan',
  CREATING: 'Starting…',
} as const;

/** The line under the field: what the words will become, and how to add more. */
export function composerNote(hasText: boolean, attached: boolean, hint: string): ComposerNote {
  if (!hasText) return { lead: COMPOSER_COPY.RESTING_LEAD, tail: COMPOSER_COPY.RESTING_TAIL };
  return { lead: COMPOSER_COPY.NAMING_LEAD, tail: attached ? '' : hint };
}

/** What a failed create says, in the composer's own words. */
export function createErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Network error. Please check your connection.';
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't start the plan. Please try again.";
}

/** Images kept for a plan before its room opened: their paths and chips. */
export interface OpeningImages {
  paths: string[];
  chips: string[];
}

const STASH_PREFIX = 'planning.opening.';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function stashOpening(sessionId: string, images: OpeningImages, s = store()): void {
  if (!s || images.paths.length === 0) return;
  try {
    s.setItem(STASH_PREFIX + sessionId, JSON.stringify(images));
  } catch {
    // Quota or a private window: the plan opens without its screenshots.
  }
}

/** The stash for a plan, taken once — the room sends it with the opening turn. */
export function takeOpening(sessionId: string, s = store()): OpeningImages | null {
  if (!s) return null;
  try {
    const raw = s.getItem(STASH_PREFIX + sessionId);
    if (!raw) return null;
    s.removeItem(STASH_PREFIX + sessionId);
    const parsed = JSON.parse(raw) as Partial<OpeningImages>;
    const paths = Array.isArray(parsed.paths) ? parsed.paths.filter(isString) : [];
    const chips = Array.isArray(parsed.chips) ? parsed.chips.filter(isString) : [];
    return paths.length ? { paths, chips } : null;
  } catch {
    return null;
  }
}

/** The opening turn with its chips appended, so the engine keeps those images. */
export function openingWithChips(opening: string, images: OpeningImages | null): string {
  if (!images || images.chips.length === 0) return opening;
  return `${opening.trimEnd()} ${images.chips.join(' ')}`.trim();
}

const isString = (value: unknown): value is string => typeof value === 'string';
