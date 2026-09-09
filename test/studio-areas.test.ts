// The Studio's section registry. Every row is addressed by a `/studio/:area`
// segment, so a row whose segment nothing serves is a dead link, and a segment
// two rows claim is a row you cannot reach.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALL_STUDIO_ROWS,
  DEFAULT_STUDIO_ITEM,
  STUDIO_GROUPS,
  itemForSegment,
  routeForItem,
} from '../src/renderer/lib/yeaboi/studio-areas';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const PATHS = new Set(registry.routes.map((r) => r.path));
const ROUTES_TSX = readFileSync(new URL('../src/renderer/app/routes.tsx', import.meta.url), 'utf8');
const SHELL = readFileSync(
  new URL('../src/renderer/components/studio/studio-shell.tsx', import.meta.url),
  'utf8',
);

describe('studio areas', () => {
  it('the page and its sections are registered routes', () => {
    expect(PATHS.has('/studio')).toBe(true);
    expect(PATHS.has('/studio/:area')).toBe(true);
  });

  // A path in routes.json but absent from routes.tsx renders PlaceholderPage,
  // silently, with the manifest check still green.
  it('both routes reach a real page in routes.tsx', () => {
    expect(ROUTES_TSX.includes("'/studio'")).toBe(true);
    expect(ROUTES_TSX.includes("'/studio/:area'")).toBe(true);
  });

  it('no segment is claimed by two rows', () => {
    const segments = ALL_STUDIO_ROWS.map((r) => r.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it('every row is a section the shell renders', () => {
    for (const row of ALL_STUDIO_ROWS) {
      expect(SHELL.includes(`item === '${row.item}'`), `${row.item} is not rendered`).toBe(true);
    }
  });

  it('every row round-trips through its route', () => {
    for (const row of ALL_STUDIO_ROWS) {
      expect(routeForItem(row.item)).toBe(`/studio/${row.segment}`);
      expect(itemForSegment(row.segment)).toBe(row.item);
    }
  });

  it('a missing or unknown segment falls back to the default', () => {
    expect(itemForSegment(undefined)).toBe(DEFAULT_STUDIO_ITEM);
    expect(itemForSegment('')).toBe(DEFAULT_STUDIO_ITEM);
    expect(itemForSegment('not-a-section')).toBe(DEFAULT_STUDIO_ITEM);
  });

  it('the default is one of the rows', () => {
    expect(ALL_STUDIO_ROWS.map((r) => r.item)).toContain(DEFAULT_STUDIO_ITEM);
  });

  it('the flattened rows are the groups, in list order', () => {
    expect(ALL_STUDIO_ROWS).toEqual(STUDIO_GROUPS.flatMap((g) => g.rows));
  });
});
