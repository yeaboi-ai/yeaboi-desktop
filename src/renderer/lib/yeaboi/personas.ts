// The renderer's view of the personas: the shared roster plus which layers
// each one is drawn with. `top` goes over everything (a hat, a thing held at
// the wing); `body` sits between the body and the wing (a belt).

export * from '@shared/personas';
import type { PersonaId } from '@shared/personas';

export type OutfitSlot = 'body' | 'top';

export const PERSONA_LAYERS: Record<PersonaId, readonly OutfitSlot[]> = {
  engineer: ['top'],
  teacher: ['top'],
  martial: ['body', 'top'],
  chef: ['top'],
  astronaut: ['top'],
  dj: ['top'],
  detective: ['top'],
  wizard: ['top'],
};
