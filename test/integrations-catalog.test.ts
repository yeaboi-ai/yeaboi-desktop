// The integrations surface's structural promises, pinned at the source.
//
// Catalog-first: the Integrations tab renders only the catalog (no
// Connected/Catalog toggle survives), the set-up view lives beside
// Credentials and filters to connector-layer rows, and a backend that
// predates /api/connections reads as staleness — muted copy, never the
// router's raw "not found" in red.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const catalog = read('src', 'renderer', 'components', 'yeaboi', 'integrations-catalog.tsx');
const credentials = read('src', 'renderer', 'components', 'settings', 'connected-integrations.tsx');
const routes = JSON.parse(read('src', 'renderer', 'lib', 'yeaboi', 'routes.json')) as {
  settings_tabs: { route: string; title: string; sections: string[] }[];
};

describe('the tab is catalog-first', () => {
  it('no view toggle survives', () => {
    expect(catalog).not.toMatch(/VIEWS\s*=\s*\[/);
    expect(catalog).not.toContain('ConnectedView');
  });

  it('the settings tab reads Catalog over the unchanged route', () => {
    const tab = routes.settings_tabs.find((t) => t.route === '/settings/connections');
    expect(tab?.title).toBe('Catalog');
    expect(tab?.sections).toEqual(['connections']);
  });

  it('the credentials tab claims the set-up view section', () => {
    const tab = routes.settings_tabs.find((t) => t.route === '/settings/credentials');
    expect(tab?.sections).toContain('integrations');
  });
});

describe('the set-up view beside credentials', () => {
  it('fetches connected-only and filters to connector-layer rows', () => {
    expect(credentials).toContain('loadConnections()');
    expect(credentials).toContain("managed_by === 'connections'");
  });
});

describe('a stale backend is staleness, not breakage', () => {
  it.each([
    ['integrations-catalog', catalog],
    ['connected-integrations', credentials],
  ])('%s rewrites the 404 into honest copy', (_name, source) => {
    expect(source).toMatch(/404\|not found/);
    expect(source).toContain('predates the integrations catalog');
  });
});
