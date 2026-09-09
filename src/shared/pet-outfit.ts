// What the pet window is told to wear: file names under its own assets, in
// stacking order, and how far above the body the layers' canvas starts. Pure,
// because the pet renderer is plain JS behind a bridge and can import none of
// this — main resolves the persona and sends the result.

import type { PersonaId } from './personas';

/** Personas with a layer between the body and the wing (the generator's BODY_PERSONAS). */
const BODY_PERSONAS: readonly PersonaId[] = ['martial'];

/** The pet layers' extra rows over the body's height (the generator's PET_HEADROOM / 509). */
export const PET_OUTFIT_RISE = 150 / 509;

export interface PetOutfit {
  /** null is the plain duck: every layer empty. */
  persona: PersonaId | null;
  /** Relative to the pet's index.html. */
  top: string | null;
  body: string | null;
  rise: number;
}

export function petOutfit(persona: PersonaId | null): PetOutfit {
  // Sent rather than omitted, so taking a costume off actually undresses the
  // duck — the pet window only re-dresses when it is handed an outfit.
  if (persona === null) return { persona: null, top: null, body: null, rise: 0 };
  return {
    persona,
    top: `assets/persona-${persona}.png`,
    body: BODY_PERSONAS.includes(persona) ? `assets/persona-${persona}-body.png` : null,
    rise: PET_OUTFIT_RISE,
  };
}
