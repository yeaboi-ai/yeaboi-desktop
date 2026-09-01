// Each world's mark. The half of a world's identity that cannot live in
// @shared/audience (which stays pure for the node lane) — the copy and accents
// are there, only the JSX is here.

import type { ReactElement } from 'react';
import { DuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';

/** `size` is the mark's rendered width in px, as DuckMark takes it. */
export const WORLD_MASCOT: Record<Audience, (props: { size: number }) => ReactElement> = {
  solo: ({ size }) => <DuckMark state="idle" size={size} />,
  team: ({ size }) => <TeamMark size={size} />,
  agents: ({ size }) => <RoboMark size={size} />,
};
