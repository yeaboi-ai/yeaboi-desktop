// The deck's turn list, and the route it says you are standing on.
//
// A section route is a prefix of every page under it, so "which of these am I
// on" has to prefer the most specific answer: matching the section instead
// steps from a page to itself and the deck reads as stuck.

import { describe, expect, it } from 'vitest';

/** The deck's own rule, extracted so it can be checked without a router. */
function standingOn(routes: string[], pathname: string): number {
  let here = -1;
  for (const [index, route] of routes.entries()) {
    if (pathname !== route && !pathname.startsWith(`${route}/`)) continue;
    if (here === -1 || route.length > routes[here]!.length) here = index;
  }
  return here;
}

const RAIL = [
  '/home',
  '/projects',
  '/projects/new/from-roadmap',
  '/team/analysis',
  '/team/standup',
];

describe('the route the deck says you are on', () => {
  it('prefers the most specific route, whatever the order', () => {
    expect(standingOn(RAIL, '/projects/new/from-roadmap')).toBe(2);
    expect(standingOn([...RAIL].reverse(), '/projects/new/from-roadmap')).toBe(2);
  });

  it('still finds a section by its own path and by a page under it', () => {
    expect(standingOn(RAIL, '/projects')).toBe(1);
    expect(standingOn(RAIL, '/projects/abc123')).toBe(1);
    expect(standingOn(RAIL, '/team/standup/setup')).toBe(4);
  });

  it('turns to a different route than the one it is on', () => {
    const here = standingOn(RAIL, '/projects/new/from-roadmap');
    expect(RAIL[(here + 1) % RAIL.length]).not.toBe('/projects/new/from-roadmap');
  });

  it('is nowhere when no route claims the path', () => {
    expect(standingOn(RAIL, '/settings/duck')).toBe(-1);
  });
});
