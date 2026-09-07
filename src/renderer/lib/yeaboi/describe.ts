// What the describe box promises, in one voice. The composer takes a first
// description; yeaboi names the project from it and the first planning session
// opens with it, so the words are never spent — they can be built on in the
// conversation or left as they are. Four screens say that, and they say it from
// here. `openingLine` is the function that makes it true.

/** A project as the first-run test sees it: how many sessions it has had. */
export interface SessionCount {
  length: number;
}

export const DESCRIBE_COPY = {
  /** Under the empty composer, before a word is typed. */
  RESTING_LEAD: 'A first description is enough',
  RESTING_TAIL: 'you build on it in the conversation.',
  /** Under the composer once there are words. */
  NAMING_LEAD: 'yeaboi names it from this and opens with it',
  /** The first-run card on a project that has had no session yet. */
  CARD_TITLE: 'Start the conversation',
  CARD_BODY:
    'What you wrote is above, and the first session opens with it — add to it there, or start from it as it is. Nothing is lost.',
  CARD_ACTION: 'Start the conversation',
  CARD_MODES: 'Or run a mode inside this project',
  /** Under the session idea box, while it still carries the description. */
  CARRIED: 'From your project description. Use it as it is, or build on it here.',
} as const;

/** The note under the composer, in the sheet's own two tones: the promise in
 *  the ledger's serif, the consequence in smaller body type beside it. A tail
 *  may be empty — SheetWord's is optional too. */
export interface ComposerNote {
  lead: string;
  tail: string;
}

export function composerNote(
  hasText: boolean,
  attached: boolean,
  referenceHint: string,
): ComposerNote {
  if (!hasText) {
    return { lead: DESCRIBE_COPY.RESTING_LEAD, tail: DESCRIBE_COPY.RESTING_TAIL };
  }
  return { lead: DESCRIBE_COPY.NAMING_LEAD, tail: attached ? '' : referenceHint };
}

/** A project with no session yet has nothing for the dashboard to show. */
export function isFirstRun(sessions: SessionCount): boolean {
  return sessions.length === 0;
}

/** Fold the project's description into a sentence the starter can open.
 *  Lowercases the first letter and drops a trailing full stop so
 *  "I'm planning a new feature that " reads on into it. */
export function openingLine(
  starter: string,
  projectDescription: string | null | undefined,
): string {
  const description = (projectDescription ?? '').trim();
  if (!description) return starter;
  const folded = (description.charAt(0).toLowerCase() + description.slice(1)).replace(/\.$/, '');
  return `${starter}${folded}`;
}

/** Does the idea still carry the project's description? Answers both whether to
 *  say where the words came from and whether an off-topic check is worth making.
 *  The trailing full stop goes because `openingLine` drops it. */
export function carriesDescription(
  idea: string,
  projectDescription: string | null | undefined,
): boolean {
  const description = (projectDescription ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!description) return false;
  return idea.toLowerCase().includes(description);
}
