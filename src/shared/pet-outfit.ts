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
  persona: PersonaId;
  /** Relative to the pet's index.html. */
  top: string;
  body: string | null;
  rise: number;
}

export function petOutfit(persona: PersonaId): PetOutfit {
  return {
    persona,
    top: `assets/persona-${persona}.png`,
    body: BODY_PERSONAS.includes(persona) ? `assets/persona-${persona}-body.png` : null,
    rise: PET_OUTFIT_RISE,
  };
}
