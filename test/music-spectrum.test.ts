// The spectrum in the terminal's eight characters.

import { describe, expect, it } from 'vitest';
import {
  EQ_GLYPHS,
  bandLevels,
  blockGlyphs,
  flatGlyphs,
  syntheticLevels,
} from '../src/renderer/lib/music/spectrum';

describe('the glyphs', () => {
  it('are the terminal’s _EQ_CHARS, floor to full block', () => {
    expect(EQ_GLYPHS).toBe('▁▂▃▄▅▆▇█');
    expect(blockGlyphs([0, 1])).toBe('▁█');
    expect(blockGlyphs([3 / 7])).toBe('▄');
    expect(blockGlyphs([Number.NaN, -1, 2])).toBe('▁▁█');
  });

  it('rest on the floor', () => {
    expect(flatGlyphs(4)).toBe('▁▁▁▁');
    expect(flatGlyphs(0)).toBe('');
  });
});

describe('bandLevels', () => {
  it('reads the lower half of the spectrum, averaged per band, in 0..1', () => {
    const bins = new Uint8Array(64);
    bins.fill(255, 0, 8);
    const levels = bandLevels(bins, 4);
    expect(levels).toHaveLength(4);
    expect(levels[0]).toBe(1);
    expect(levels[3]).toBe(0);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('copes with fewer bins than bands', () => {
    expect(bandLevels(new Uint8Array(2), 8)).toHaveLength(8);
    expect(bandLevels(new Uint8Array(0), 4)).toEqual([0, 0, 0, 0]);
    expect(bandLevels(new Uint8Array(16), 0)).toEqual([]);
  });
});

describe('syntheticLevels', () => {
  it('stays in 0..1 and moves with the phase', () => {
    const a = syntheticLevels(0, 16);
    const b = syntheticLevels(1, 16);
    expect(a).toHaveLength(16);
    for (const level of [...a, ...b]) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
    expect(a).not.toEqual(b);
  });
});
