// The scenes a story is pictured in: every prop well formed, every scene a
// full frame with room for the duck, a caption in prose, and a scene for
// every topic and kind.

import { describe, expect, it } from 'vitest';
import {
  ACCENT,
  ALPHABET,
  CELL,
  CLEAR,
  DUCK_CELLS,
  FRAME,
  HALF,
  INK,
  PAPER,
  box,
  cellAt,
  count,
  emptyGrid,
  halftoneInks,
  line,
  place,
  ring,
  stars,
  triangle,
} from '../src/renderer/lib/news/scenes/alphabet';
import * as props from '../src/renderer/lib/news/scenes/props';
import {
  SCENES,
  SCENE_BY_TOPIC,
  SCENE_IDS,
  buildScene,
  sceneFor,
  standFits,
} from '../src/renderer/lib/news/scenes/scenes';

const TOPICS = [
  'security',
  'policy',
  'compute',
  'media',
  'models',
  'research',
  'tooling',
  'howto',
  'general',
] as const;

describe('the alphabet', () => {
  it('is the duck pitch, and the frame fits the sprite and its hat', () => {
    expect(CELL).toBe(2);
    expect(FRAME).toEqual({ w: 200, h: 120 });
    expect(DUCK_CELLS).toEqual({ w: 64, h: 68, headroom: 20 });
    expect(FRAME.h).toBeGreaterThan(DUCK_CELLS.h + DUCK_CELLS.headroom);
  });

  it('halftone is a checker over the frame', () => {
    expect(halftoneInks(0, 0)).toBe(true);
    expect(halftoneInks(1, 0)).toBe(false);
    expect(halftoneInks(1, 1)).toBe(true);
  });

  it('draws inside the frame and ignores what falls outside', () => {
    const grid = emptyGrid();
    box(grid, -2, -2, 6, 6, 1);
    expect(cellAt(grid, 0, 3)).toBe(INK);
    expect(cellAt(grid, 3, 0)).toBe(INK);
    expect(cellAt(grid, 1, 1)).toBe(CLEAR);
    expect(cellAt(grid, -1, -1)).toBe(CLEAR);
    line(grid, 190, 110, 230, 150, 1);
    expect(cellAt(grid, 199, 119)).toBe(INK);
    triangle(grid, 10, 10, 6, 14, 14, HALF);
    expect(cellAt(grid, 10, 10)).toBe(HALF);
    expect(cellAt(grid, 6, 14)).toBe(HALF);
    ring(grid, 50, 50, 10, 2, ACCENT);
    expect(cellAt(grid, 59, 50)).toBe(ACCENT);
    expect(cellAt(grid, 50, 50)).toBe(CLEAR);
    place(grid, ['.p', 'p.'], 100, 100);
    expect(cellAt(grid, 101, 100)).toBe(PAPER);
    expect(cellAt(grid, 100, 100)).toBe(CLEAR);
  });

  it('seeds the same stars every time, and never over ink', () => {
    const a = emptyGrid();
    const b = emptyGrid();
    box(a, 0, 0, 200, 60, 60);
    stars(a, 3, 10);
    expect(count(a, INK)).toBe(200 * 60);
    stars(b, 3, 10);
    const c = emptyGrid();
    stars(c, 3, 10);
    expect(count(b, INK)).toBe(10);
    expect([...b]).toEqual([...c]);
  });
});

describe('the props', () => {
  const entries = Object.entries(props) as [string, readonly string[]][];

  it('exist', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it.each(entries)('%s is a rectangle of alphabet letters', (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    const width = rows[0]!.length;
    for (const row of rows) {
      expect(row.length).toBe(width);
      for (const ch of row) expect(ALPHABET).toContain(ch);
    }
    expect(rows.some((row) => row.includes(INK))).toBe(true);
  });
});

describe('the scenes', () => {
  it('are the eleven, in a record that matches the list', () => {
    expect(SCENE_IDS).toHaveLength(11);
    expect(Object.keys(SCENES).sort()).toEqual([...SCENE_IDS].sort());
    for (const id of SCENE_IDS) expect(SCENES[id].id).toBe(id);
  });

  it.each(SCENE_IDS)(
    '%s fills a frame, leaves room for the duck, and has ink and one accent',
    (id) => {
      const grid = buildScene(id);
      expect(grid.length).toBe(FRAME.w * FRAME.h);
      expect(standFits(SCENES[id].stand)).toBe(true);
      expect(count(grid, INK)).toBeGreaterThan(200);
      expect(count(grid, ACCENT)).toBeGreaterThan(0);
      expect(count(grid, ACCENT)).toBeLessThan(400);
      // Something stands on the ground line.
      expect(cellAt(grid, 150, SCENES[id].stand.y)).not.toBe(CLEAR);
    },
  );

  it.each(SCENE_IDS)('%s has a caption in prose', (id) => {
    const caption = SCENES[id].caption;
    expect(caption).toMatch(/^[A-Z]/);
    expect(caption).toMatch(/\.$/);
    expect(caption).not.toMatch(/[·→—]/);
    expect((caption.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => w !== 'DJ')).toEqual([]);
    expect(caption.length).toBeLessThanOrEqual(60);
  });

  it('builds the same grid every time', () => {
    expect([...buildScene('observatory')]).toEqual([...buildScene('observatory')]);
  });
});

describe('sceneFor', () => {
  it('pictures every topic, and general at the newsstand', () => {
    for (const topic of TOPICS) {
      expect(SCENE_IDS).toContain(SCENE_BY_TOPIC[topic]);
      expect(sceneFor({ kind: 'article', topic })).toBe(SCENE_BY_TOPIC[topic]);
    }
    expect(sceneFor({ kind: 'article', topic: 'general' })).toBe('newsstand');
    expect(sceneFor({ kind: 'post', topic: 'something-new' })).toBe('newsstand');
  });

  it('puts every release at the dock and every video in the studio', () => {
    expect(sceneFor({ kind: 'release', topic: 'security' })).toBe('dock');
    expect(sceneFor({ kind: 'video', topic: 'tooling' })).toBe('studio');
  });
});
