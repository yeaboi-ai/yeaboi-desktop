// Each world's mark. The half of a world's identity that cannot live in
// @shared/audience (which stays pure for the node lane) — the copy and accents
// are there, only the JSX is here.

import type { ReactElement } from 'react';
import { DuckMark, PersonaDuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';
import { currentPersona } from '@/lib/home/wardrobe';

/** `size` is the mark's rendered width in px, as DuckMark takes it. `jamming`
 *  is music playing: only the duck has a dance, the other marks keep still. */
export const WORLD_MASCOT: Record<
  Audience,
  (props: { size: number; jamming?: boolean }) => ReactElement
> = {
  solo: ({ size, jamming }) => <DuckMark state="idle" size={size} jamming={jamming} />,
  team: ({ size }) => <TeamMark size={size} />,
};

/** The duck in the persona the home's duck wore on the last visit, so it
 *  follows the reader onto the pages. */
export function PersonaMascot({ size }: { size: number }): ReactElement {
  return <PersonaDuckMark persona={currentPersona()} size={size} />;
}

/** The mark the agentwatch pages draw: the robo, in the current persona. */
export function RoboPersonaMascot({ size }: { size: number }): ReactElement {
  return <RoboMark persona={currentPersona()} size={size} />;
}
