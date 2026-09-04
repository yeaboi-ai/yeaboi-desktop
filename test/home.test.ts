// Which screens each door's duck follows the reader into.

import { describe, expect, it } from 'vitest';
import { doorForPath } from '../src/renderer/lib/yeaboi/home';

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
