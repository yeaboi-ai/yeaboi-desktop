// The home's two doors as data: the word on each, where it opens per world,
// and which door a route belongs to, so the door's own duck can follow the
// reader in. Pure (test/home.test.ts); the diptych and the title bar draw it.

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
