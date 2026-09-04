// The home's two doors as data: the word on each, the fact under each, where
// it opens per world, and which door a route belongs to, so the door's own duck
// can follow the reader in. Pure (test/home.test.ts); the home and the title
// bar draw it.

import type { Audience } from '@shared/audience';
import { projectsHref } from '@/lib/nav/sections';

/** The two ways to work: a project remembers, a session starts fresh. */
export type Door = 'projects' | 'sessions';

export const DOORS: readonly Door[] = ['projects', 'sessions'];

const WORDS: Record<Door, string> = { projects: 'Projects', sessions: 'Sessions' };

export function doorWord(door: Door): string {
  return WORDS[door];
}

export function doorHref(door: Door, audience: Audience): string {
  return door === 'projects' ? projectsHref(audience) : '/sessions';
}

/** The door a route is inside, if any: the door's duck lives on those screens. */
export function doorForPath(pathname: string): Door | null {
  if (/^\/(agents\/)?projects(\/|$)/.test(pathname)) return 'projects';
  if (/^\/sessions(\/|$)/.test(pathname)) return 'sessions';
  return null;
}

/** The fact under each half of the home. The one distinction that matters:
 *  inside a project, every run reads the ones before it; a session carries
 *  nothing over. */
export function doorFact(door: Door, audience: Audience): string {
  if (door === 'projects') {
    return audience === 'agents'
      ? 'Every report reads the linked repo alone.'
      : 'Every run reads the ones before it.';
  }
  return audience === 'agents'
    ? 'The whole machine once, nothing carried over.'
    : 'One run, nothing carried over.';
}

/** What a column of the home says when there is nothing to run inside yet. */
export function doorEmpty(door: Door, audience: Audience): string {
  if (door === 'projects') {
    return audience === 'agents'
      ? 'Create a project and link a repo, and these read it alone.'
      : 'Create a project and these run inside it.';
  }
  return audience === 'agents'
    ? 'No report yet. Open one to run the first pass.'
    : 'Nothing has run on its own yet.';
}

/** What a half says when projects exist but nothing has run yet. */
export function doorNothingYet(door: Door, audience: Audience): string {
  if (door === 'projects') {
    return audience === 'agents'
      ? 'No report inside a project yet.'
      : 'Nothing has run inside a project yet.';
  }
  return doorEmpty('sessions', audience);
}
