// Each world's mark. The half of a world's identity that cannot live in
// @shared/audience (which stays pure for the node lane) — the copy and accents
// are there, only the JSX is here.

import type { ReactElement } from 'react';
import { DoorDuckMark, DuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';
import type { Door } from '@/lib/yeaboi/home';

/** `size` is the mark's rendered width in px, as DuckMark takes it. */
export const WORLD_MASCOT: Record<Audience, (props: { size: number }) => ReactElement> = {
  solo: ({ size }) => <DuckMark state="idle" size={size} />,
  team: ({ size }) => <TeamMark size={size} />,
  agents: ({ size }) => <RoboMark size={size} />,
};

/** A door's own duck in each world: the same character in that door's kit,
 *  feathered or steel. It follows the reader onto the door's screens. */
export const DOOR_MASCOT: Record<
  Audience,
  Record<Door, (props: { size: number }) => ReactElement>
> = {
  solo: {
    projects: ({ size }) => <DoorDuckMark door="projects" size={size} />,
    sessions: ({ size }) => <DoorDuckMark door="sessions" size={size} />,
  },
  team: {
    projects: ({ size }) => <DoorDuckMark door="projects" size={size} />,
    sessions: ({ size }) => <DoorDuckMark door="sessions" size={size} />,
  },
  agents: {
    projects: ({ size }) => <RoboMark door="projects" size={size} />,
    sessions: ({ size }) => <RoboMark door="sessions" size={size} />,
  },
};
