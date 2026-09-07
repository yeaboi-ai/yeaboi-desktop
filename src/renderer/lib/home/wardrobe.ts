// Which persona each door's duck wears. The pair changes quietly on every
// visit to the home, never mid-visit: `nextVisit` is called once when the home
// mounts, and the door screens' marks read `currentPair`. Pure
// (test/personas.test.ts).

import { PERSONA_IDS, type PersonaId } from '@shared/personas';
import type { Door } from '@/lib/yeaboi/home';

/** The two personas for visit `n`: always distinct, and every persona in the
 *  roster is seen within four visits. */
export function visitPair(visit: number): Record<Door, PersonaId> {
  const n = PERSONA_IDS.length;
  const at = (i: number): PersonaId => PERSONA_IDS[((i % n) + n) % n]!;
  return { projects: at(2 * visit), sessions: at(2 * visit + 1) };
}

let visits = 0;

/** The pair for a fresh visit; call once per mount of the home. */
export function nextVisit(): Record<Door, PersonaId> {
  visits += 1;
  return visitPair(visits);
}

/** The pair the last visit chose; before any visit, the first pair. */
export function currentPair(): Record<Door, PersonaId> {
  return visitPair(visits);
}
