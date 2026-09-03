// What each door's duck wears in each world. Same character, six kits: the
// kit is how a screen says which way of working it is, and which world, with
// no label. Pure (test/kits.test.ts); the marks and the pond draw it.

import type { Audience } from '@shared/audience';
import type { Door } from './home';

export type Kit = 'hardhat' | 'ring' | 'cap' | 'headset' | 'propeller' | 'bowtie';

export const KIT_NAMES: readonly Kit[] = [
  'hardhat',
  'ring',
  'cap',
  'headset',
  'propeller',
  'bowtie',
];

/** Solo builds alone and drops in for a dip; Team leads the crew and takes
 *  the call; the Agents world's robo tinkers and serves the report. */
export const KITS: Record<Audience, Record<Door, Kit>> = {
  solo: { projects: 'hardhat', sessions: 'ring' },
  team: { projects: 'cap', sessions: 'headset' },
  agents: { projects: 'propeller', sessions: 'bowtie' },
};

/** Where a kit sits in the duck's layers: the ring goes around the body,
 *  under the wing; everything else goes over the head and shades. */
export const KIT_SLOT: Record<Kit, 'body' | 'top'> = {
  hardhat: 'top',
  ring: 'body',
  cap: 'top',
  headset: 'top',
  propeller: 'top',
  bowtie: 'top',
};

export function kitFor(audience: Audience, door: Door): Kit {
  return KITS[audience][door];
}
