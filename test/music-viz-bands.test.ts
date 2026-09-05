// Bins to bands on a log scale: the maths behind every style.

import { describe, expect, it } from 'vitest';
import {
  applyGain,
  bandsFromBins,
  logBandEdges,
  regroupBands,
} from '../src/renderer/lib/music/viz/bands';

describe('logBandEdges', () => {
  it('spaces four bands 40 Hz to 16 kHz at 48 kHz / 2048 as the fixture says', () => {
    const edges = Array.from(logBandEdges(1024, 48_000, 4));
    const expected = [1.71, 7.64, 34.13, 152.65, 682.67];
    expected.forEach((value, i) => expect(edges[i]).toBeCloseTo(value, 1));
  });

  it.each([
    [4, 44_100],
    [5, 48_000],
    [16, 48_000],
    [32, 44_100],
    [64, 48_000],
  ])('keeps %i bands strictly increasing and inside the bins at %i Hz', (bands, rate) => {
    const edges = logBandEdges(1024, rate, bands);
    expect(edges).toHaveLength(bands + 1);
    for (let i = 0; i < edges.length; i += 1) {
      expect(edges[i]).toBeGreaterThanOrEqual(0);
      expect(edges[i]).toBeLessThanOrEqual(1023);
      if (i > 0) expect(edges[i]).toBeGreaterThan(edges[i - 1]!);
    }
  });

  it('handles a nonsense request without throwing', () => {
    expect(logBandEdges(0, 48_000, 4)).toHaveLength(5);
    expect(logBandEdges(1024, 48_000, 0)).toHaveLength(1);
  });
});

describe('bandsFromBins', () => {
  const edges = logBandEdges(1024, 48_000, 64);

  it('reads flat loud as all one and silence as all zero', () => {
    const out = new Float32Array(64);
    bandsFromBins(new Uint8Array(1024).fill(255), edges, out);
    for (const v of out) expect(v).toBeCloseTo(1, 5);
    bandsFromBins(new Uint8Array(1024), edges, out);
    for (const v of out) expect(v).toBe(0);
  });

  it('puts one hot bin in one band, high on the scale', () => {
    const bins = new Uint8Array(1024);
    bins[100] = 255; // 2.34 kHz
    const out = new Float32Array(64);
    bandsFromBins(bins, edges, out);
    const hot = Array.from(out)
      .map((v, i) => [v, i] as const)
      .filter(([v]) => v > 0)
      .map(([, i]) => i);
    expect(hot.length).toBeGreaterThanOrEqual(1);
    expect(hot.length).toBeLessThanOrEqual(2);
    expect(hot[0]).toBeGreaterThan(32);
  });

  it('interpolates inside a band narrower than a bin rather than repeating it', () => {
    const bins = new Uint8Array(1024);
    bins[1] = 0;
    bins[2] = 255;
    const out = new Float32Array(64);
    bandsFromBins(bins, edges, out);
    // The bottom bands share bins 1..2; their values should differ, not step.
    expect(out[0]).not.toBe(out[1]);
  });

  it('survives an empty bin array', () => {
    const out = new Float32Array(4);
    bandsFromBins(new Uint8Array(0), logBandEdges(0, 48_000, 4), out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
});

describe('applyGain', () => {
  it('never exceeds one and lifts the top end', () => {
    const levels = new Float32Array(8).fill(0.5);
    applyGain(levels, 2);
    for (const v of levels) expect(v).toBeLessThanOrEqual(1);
    const quiet = new Float32Array(8).fill(0.2);
    applyGain(quiet, 1);
    expect(quiet[7]).toBeGreaterThan(quiet[0]!);
    const silent = new Float32Array(4);
    applyGain(silent, 2);
    expect(Array.from(silent)).toEqual([0, 0, 0, 0]);
  });
});

describe('regroupBands', () => {
  it('takes the loudest of each group', () => {
    const bands = new Float32Array(64);
    bands[3] = 0.9;
    bands[63] = 0.4;
    const out = new Float32Array(4);
    regroupBands(bands, out);
    expect(Array.from(out)).toEqual([0.9 as number, 0, 0, 0.4].map((v) => Math.fround(v)));
  });

  it('gives the last column whatever does not divide evenly', () => {
    const bands = new Float32Array(64);
    bands[63] = 1;
    const out = new Float32Array(5);
    regroupBands(bands, out);
    expect(out[4]).toBe(1);
  });
});
