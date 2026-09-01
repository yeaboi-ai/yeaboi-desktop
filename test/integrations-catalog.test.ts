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

describe('create-your-own is reachable from the top, not only the bottom', () => {
  it('the toolbar and the empty-search state both open the sheet', () => {
    // Three doors, one sheet: toolbar button, empty-state action, bottom tile.
    expect(catalog.match(/setCreating\(true\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(catalog).toContain('Create it yourself');
  });
});

describe('the create sheet adapts to the kind and shows its autofill', () => {
  it('the kind control precedes the identity section', () => {
    expect(catalog.indexOf('Connection kind')).toBeGreaterThan(-1);
    expect(catalog.indexOf('Connection kind')).toBeLessThan(catalog.indexOf('title="Identity"'));
  });

  it('required and optional are marked', () => {
    expect(catalog).toContain('aria-required');
    expect(catalog).toContain('· optional');
  });

  it('the draft auto-opens the Advanced section it filled', () => {
    expect(catalog).toContain('draftFillsAdvanced');
    expect(catalog).toMatch(/if \(draftFillsAdvanced\(result\.draft\)\) setAdvanced\(true\)/);
  });

  it('only the chosen kind shape crosses the wire', () => {
    expect(catalog).toContain('cleanForKind(spec)');
    // The webhook branch rebuilds events — an api-kind leftover items_key
    // would make the receiver dig every delivery for a key that is not there.
    expect(catalog).toMatch(/path: '', items_key: ''/);
  });

  it('a fresh open replays nothing — least of all the once-only secret', () => {
    expect(catalog).toMatch(/if \(open\) \{[\s\S]*?setSecretOnce\(''\)/);
  });

  it('the connect sheet only rewrites the auth method on a deliberate pick', () => {
    const sheet = read('src', 'renderer', 'components', 'yeaboi', 'connector-sheet.tsx');
    expect(sheet).toContain('methodTouched || !row.connected');
  });

  it('the api kind can declare extra credentials and an events endpoint', () => {
    expect(catalog).toContain('ExtraFieldsEditor');
    expect(catalog).toContain('Events endpoint');
  });

  it('the accent is picked from swatches or a wheel, never typed', () => {
    expect(catalog).toContain('AccentPicker');
    expect(catalog).toContain('type="color"');
    expect(catalog).not.toContain('Accent rgb(r,g,b)');
  });
});

describe('the uploaded icon is raster-only', () => {
  it('the file input accepts the three raster types and never svg', () => {
    expect(catalog).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(catalog).not.toContain('svg+xml');
  });

  it('the tile renders the uploaded image when the wire carries one', () => {
    const sheet = read('src', 'renderer', 'components', 'yeaboi', 'connector-sheet.tsx');
    expect(sheet).toContain('row.icon');
    expect(sheet).toMatch(/src=\{row\.icon\}/);
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
