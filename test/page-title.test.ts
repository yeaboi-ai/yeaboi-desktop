// The window title comes from the route registry, so a page renamed there is
// renamed in the title bar too.

import { describe, expect, it } from 'vitest';
import { APP_ROUTES, pageTitle } from '../src/renderer/lib/yeaboi/routes';

describe('pageTitle', () => {
  it('reads the registry title, before any section suffix', () => {
    expect(pageTitle('/home')).toBe('Home');
    expect(pageTitle('/settings/credentials')).toBe('Settings');
    expect(pageTitle('/privacy')).toBe('Privacy');
  });

  it('matches a dynamic route by segment', () => {
    // A path route with a parameter — `action:*` rows carry a colon but are not paths.
    const dynamic = APP_ROUTES.find((r) => r.path.startsWith('/') && r.path.includes('/:'));
    expect(dynamic).toBeDefined();
    const concrete = dynamic!.path.replace(/:[^/]+/g, 'x1');
    expect(pageTitle(concrete)).toBe(dynamic!.title.split(' · ')[0]);
  });

  it('names the app for anything unregistered', () => {
    expect(pageTitle('/nowhere')).toBe('yeaboi');
  });
});
