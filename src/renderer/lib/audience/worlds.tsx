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

/** `size` is the mark's rendered width in px, as DuckMark takes it. */
export const WORLD_MASCOT: Record<Audience, (props: { size: number }) => ReactElement> = {
  solo: ({ size }) => <DuckMark state="idle" size={size} />,
  team: ({ size }) => <TeamMark size={size} />,
  agents: ({ size }) => <RoboMark size={size} />,
};

/** A door's own duck: the persona the home's duck for that door wore on the
 *  last visit, feathered or steel, so it follows the reader onto the door's
 *  screens. */
export function DoorMascot({
  audience,
  door,
  size,
}: {
  audience: Audience;
  door: Door;
  size: number;
}): ReactElement {
  const persona = currentPair()[door];
  if (audience === 'agents') return <RoboMark persona={persona} size={size} />;
  return <PersonaDuckMark persona={persona} size={size} />;
}

export const DOOR_MASCOT: Record<
  Audience,
  Record<Door, (props: { size: number }) => ReactElement>
> = {
  solo: {
    projects: ({ size }) => <DoorMascot audience="solo" door="projects" size={size} />,
    sessions: ({ size }) => <DoorMascot audience="solo" door="sessions" size={size} />,
  },
  team: {
    projects: ({ size }) => <DoorMascot audience="team" door="projects" size={size} />,
    sessions: ({ size }) => <DoorMascot audience="team" door="sessions" size={size} />,
  },
  agents: {
    projects: ({ size }) => <DoorMascot audience="agents" door="projects" size={size} />,
    sessions: ({ size }) => <DoorMascot audience="agents" door="sessions" size={size} />,
  },
};
