// Who the duck is: eight personas, one character. Pure, so the main process
// (the pet window), the renderer (the home, the marks, the screensaver) and
// the tests all read the same roster and the same rotation.

export type PersonaId =
  'engineer' | 'teacher' | 'martial' | 'chef' | 'astronaut' | 'dj' | 'detective' | 'wizard';

/** Roster order; the generator's PERSONAS tuple is held equal to it. */
export const PERSONA_IDS: readonly PersonaId[] = [
  'engineer',
  'teacher',
  'martial',
  'chef',
  'astronaut',
  'dj',
  'detective',
  'wizard',
];

export interface Persona {
  id: PersonaId;
  name: string;
  /** One quiet sentence for a tooltip. */
  blurb: string;
}

export const PERSONAS: readonly Persona[] = [
  { id: 'engineer', name: 'Engineer', blurb: 'Hard hat on, spanner under the wing.' },
  { id: 'teacher', name: 'Teacher', blurb: 'Mortarboard and a pointer for the board.' },
  { id: 'martial', name: 'Martial artist', blurb: 'Headband tied, black belt earned.' },
  { id: 'chef', name: 'Chef', blurb: 'A tall toque and a neckerchief.' },
  { id: 'astronaut', name: 'Astronaut', blurb: 'Helmet on, visor up, pack strapped.' },
  { id: 'dj', name: 'DJ', blurb: 'Headphones on, one ear free.' },
  { id: 'detective', name: 'Detective', blurb: 'Deerstalker and a magnifier.' },
  { id: 'wizard', name: 'Wizard', blurb: 'A pointed hat and a wand.' },
];

/** The setting: one persona, or let the duck change on its own. */
export const ROTATE = 'rotate';
export type PersonaChoice = PersonaId | typeof ROTATE;
export const DEFAULT_PERSONA: PersonaChoice = ROTATE;

/** How long the pet and the screensaver keep one persona while rotating. */
export const ROTATE_MINUTES = 30;
const ROTATE_MS = ROTATE_MINUTES * 60 * 1000;

export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && (PERSONA_IDS as readonly string[]).includes(value);
}

export function isPersonaChoice(value: unknown): value is PersonaChoice {
  return value === ROTATE || isPersonaId(value);
}

export function personaName(id: PersonaId): string {
  return PERSONAS.find((p) => p.id === id)?.name ?? id;
}

/** The persona on rotation at `now` (ms): stable inside one period, every
 *  persona in turn, and the same answer on every surface. */
export function personaAt(now: number, periodMs = ROTATE_MS): PersonaId {
  const slot = Math.floor(Math.max(0, now) / periodMs);
  return PERSONA_IDS[slot % PERSONA_IDS.length]!;
}

export function resolvePersona(choice: PersonaChoice, now: number): PersonaId {
  return choice === ROTATE ? personaAt(now) : choice;
}
