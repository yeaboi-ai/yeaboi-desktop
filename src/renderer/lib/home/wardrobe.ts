// Which persona the duck wears. It changes quietly on every visit to the home,
// never mid-visit: `nextVisit` is called once when the home mounts, and the
// marks elsewhere read `currentPersona`. Pure (test/personas.test.ts).

import { PERSONA_IDS, type PersonaId } from '@shared/personas';

/** The persona for visit `n`: every persona in the roster is seen within one
 *  lap of the list. */
export function visitPersona(visit: number): PersonaId {
  const n = PERSONA_IDS.length;
  return PERSONA_IDS[((visit % n) + n) % n]!;
}

let visits = 0;

/** The persona for a fresh visit; call once per mount of the home. */
export function nextVisit(): PersonaId {
  visits += 1;
  return visitPersona(visits);
}

/** The persona the last visit chose; before any visit, the first one. */
export function currentPersona(): PersonaId {
  return visitPersona(visits);
}
