// The home's two doors: the word on each, the fact under each, where it opens
// per world, and which screens each door's duck follows the reader into.

import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import {
  DOORS,
  doorEmpty,
  doorFact,
  doorForPath,
  doorHref,
  doorNothingYet,
  doorWord,
} from '../src/renderer/lib/yeaboi/home';

describe('the two doors', () => {
  it('are Projects then Sessions, one word each, sentence case, no tells', () => {
    expect(DOORS).toEqual(['projects', 'sessions']);
    for (const door of DOORS) {
      const word = doorWord(door);
      expect(word).toMatch(/^[A-Z][a-z]+$/);
      expect(word).not.toMatch(/[·→—]/);
    }
    expect(doorWord('projects')).toBe('Projects');
    expect(doorWord('sessions')).toBe('Sessions');
  });

  it('open the world’s own projects list and the one sessions list', () => {
    for (const audience of AUDIENCES) {
      expect(doorHref('sessions', audience)).toBe('/sessions');
    }
    expect(doorHref('projects', 'team')).toBe('/projects');
    expect(doorHref('projects', 'solo')).toBe('/projects');
    expect(doorHref('projects', 'agents')).toBe('/agents/projects');
  });
});

describe('doorForPath', () => {
  it('claims the whole of each door’s screens, in every world', () => {
    for (const path of ['/projects', '/projects/abc', '/agents/projects', '/agents/projects/x']) {
      expect(doorForPath(path), path).toBe('projects');
    }
    for (const path of ['/sessions', '/sessions/abc']) {
      expect(doorForPath(path), path).toBe('sessions');
    }
  });

  it('leaves every other screen to the world’s own mark', () => {
    for (const path of [
      '/',
      '/home',
      '/settings',
      '/agents',
      '/projectsx',
      '/session',
      '/standup',
    ]) {
      expect(doorForPath(path), path).toBeNull();
    }
  });
});

describe('the fact under each half', () => {
  it('says the one thing that tells the doors apart: a run inside a project reads the earlier ones', () => {
    for (const audience of AUDIENCES) {
      const projects = doorFact('projects', audience);
      const sessions = doorFact('sessions', audience);
      expect(projects).not.toBe(sessions);
      expect(sessions).toMatch(/carried over/);
    }
    expect(doorFact('projects', 'team')).toMatch(/reads the ones before/);
    expect(doorFact('projects', 'solo')).toMatch(/reads the ones before/);
    expect(doorFact('projects', 'agents')).toMatch(/repo/);
  });

  it('is short enough to sit under the thread: eight words at most', () => {
    for (const audience of AUDIENCES) {
      for (const door of DOORS) {
        expect(doorFact(door, audience).split(/\s+/).length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('carries none of the templated tells, in every world', () => {
    for (const audience of AUDIENCES) {
      for (const door of DOORS) {
        for (const text of [
          doorFact(door, audience),
          doorEmpty(door, audience),
          doorNothingYet(door, audience),
        ]) {
          expect(text).toMatch(/^[A-Z]/);
          expect(text).toMatch(/\.$/);
          expect(text).not.toMatch(/[·→—]/);
          expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
        }
      }
    }
  });

  it('tells an empty list apart from one with nothing run inside yet', () => {
    for (const audience of AUDIENCES) {
      expect(doorNothingYet('projects', audience)).not.toBe(doorEmpty('projects', audience));
      expect(doorNothingYet('sessions', audience)).toBe(doorEmpty('sessions', audience));
    }
  });
});
