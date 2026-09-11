// The planning routes: every one the registry names is served by the router,
// and the old session paths are gone rather than multiplying.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const ROUTER = readFileSync(join(__dirname, '../src/renderer/app/routes.tsx'), 'utf8');

const PLANNING = registry.routes.map((r) => r.path).filter((p) => p.startsWith('/planning'));

describe('the planning routes', () => {
  it('are all registered', () => {
    expect(PLANNING).toEqual([
      '/planning',
      '/planning/new',
      '/planning/from-roadmap',
      '/planning/:id',
      '/planning/:id/completed',
    ]);
  });

  it('are each served explicitly by the router', () => {
    for (const path of PLANNING) {
      expect(ROUTER, `${path} is not served`).toContain(`'${path}'`);
    }
  });

  it('carry the capability the parity registry expects', () => {
    const caps = Object.fromEntries(registry.routes.map((r) => [r.path, r.capability]));
    expect(caps['/planning']).toBe('planning');
    expect(caps['/planning/new']).toBe('planning');
    expect(caps['/planning/:id']).toBe('planning');
    expect(caps['/planning/from-roadmap']).toBe('roadmap');
    expect(caps['/planning/:id/completed']).toBeNull();
    expect(caps['dialog:context-scope']).toBe('context');
  });

  it('has no session path left, only redirects for the old links', () => {
    expect(registry.routes.map((r) => r.path).filter((p) => p.startsWith('/sessions'))).toEqual([]);
    expect(ROUTER).toContain("path: '/sessions/*'");
    expect(ROUTER).toContain("path: '/projects/*'");
  });

  it('keeps the room bare and the recap framed', () => {
    const shell = readFileSync(join(__dirname, '../src/renderer/components/app-shell.tsx'), 'utf8');
    expect(shell).toContain('isBareRoom(');
  });
});
