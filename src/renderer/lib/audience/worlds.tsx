// Each world's mark. The half of a world's identity that cannot live in
// @shared/audience (which stays pure for the node lane) — the copy and accents
// are there, only the JSX is here.

import type { ReactElement } from 'react';
import { DuckMark, KitDuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';
import type { Door } from '@/lib/yeaboi/home';
import { KITS } from '@/lib/yeaboi/kits';

/** `size` is the mark's rendered width in px, as DuckMark takes it. */
export const WORLD_MASCOT: Record<Audience, (props: { size: number }) => ReactElement> = {
  solo: ({ size }) => <DuckMark state="idle" size={size} />,
  team: ({ size }) => <TeamMark size={size} />,
  agents: ({ size }) => <RoboMark size={size} />,
};

/** A door's own duck in each world: the same character in that world's kit
 *  for that door, feathered or steel. It follows the reader onto the door's
 *  screens. */
export const DOOR_MASCOT: Record<
  Audience,
  Record<Door, (props: { size: number }) => ReactElement>
> = {
  solo: {
    projects: ({ size }) => <KitDuckMark kit={KITS.solo.projects} size={size} />,
    sessions: ({ size }) => <KitDuckMark kit={KITS.solo.sessions} size={size} />,
  },
  team: {
    projects: ({ size }) => <KitDuckMark kit={KITS.team.projects} size={size} />,
    sessions: ({ size }) => <KitDuckMark kit={KITS.team.sessions} size={size} />,
  },
  agents: {
    projects: ({ size }) => <RoboMark kit={KITS.agents.projects} size={size} />,
    sessions: ({ size }) => <RoboMark kit={KITS.agents.sessions} size={size} />,
  },
};
