// Which door a route belongs to, so the door's own duck can follow the reader
// in. Pure (test/home.test.ts); the title bar and the door screens read it.

/** The two ways to work: a project remembers, a session starts fresh. */
export type Door = 'projects' | 'sessions';

/** The door a route is inside, if any: the door's duck lives on those screens. */
export function doorForPath(pathname: string): Door | null {
  if (/^\/(agents\/)?projects(\/|$)/.test(pathname)) return 'projects';
  if (/^\/sessions(\/|$)/.test(pathname)) return 'sessions';
  return null;
}
