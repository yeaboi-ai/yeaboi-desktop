// Each world's mark. The half of a world's identity that cannot live in
// @shared/audience (which stays pure for the node lane) — the copy and accents
// are there, only the JSX is here.

import type { ReactElement } from 'react';
import { DuckMark, PersonaDuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';
import { currentPair } from '@/lib/home/wardrobe';
import type { Door } from '@/lib/yeaboi/home';

/** `size` is the mark's rendered width in px, as DuckMark takes it. `jamming`
 *  is music playing: only the duck has a dance, the other marks keep still. */
export const WORLD_MASCOT: Record<
  Audience,
  (props: { size: number; jamming?: boolean }) => ReactElement
> = {
  solo: ({ size, jamming }) => <DuckMark state="idle" size={size} jamming={jamming} />,
  team: ({ size }) => <TeamMark size={size} />,
};

/** A door's own duck: the persona the home's duck for that door wore on the
 *  last visit, feathered or steel, so it follows the reader onto the door's
 *  screens. */
export function DoorMascot({ door, size }: { door: Door; size: number }): ReactElement {
  return <PersonaDuckMark persona={currentPair()[door]} size={size} />;
}

/** The mark the agentwatch pages draw: the robo, in the current persona. */
export function RoboDoorMascot({ size }: { size: number }): ReactElement {
  return <RoboMark persona={currentPair().projects} size={size} />;
}

export const DOOR_MASCOT: Record<
  Audience,
  Record<Door, (props: { size: number }) => ReactElement>
> = {
  solo: {
    projects: ({ size }) => <DoorMascot door="projects" size={size} />,
    sessions: ({ size }) => <DoorMascot door="sessions" size={size} />,
  },
  team: {
    projects: ({ size }) => <DoorMascot door="projects" size={size} />,
    sessions: ({ size }) => <DoorMascot door="sessions" size={size} />,
  },
};
