// Attack, decay and the falling peak cap.

import { describe, expect, it } from 'vitest';
import { PEAK, peakStep, smoothStep, taus } from '../src/renderer/lib/music/viz/smooth';

describe('taus', () => {
  it('rises faster than it falls, and slows with the preference', () => {
    for (const s of [0, 0.25, 0.5, 1]) {
      const t = taus(s);
      expect(t.attack).toBeLessThan(t.decay);
    }
    expect(taus(1).attack).toBeGreaterThan(taus(0).attack);
    expect(taus(1).decay).toBeGreaterThan(taus(0).decay);
    expect(taus(Number.NaN)).toEqual(taus(0.5));
  });
});

describe('smoothStep', () => {
  it('does nothing for no time', () => {
    const prev = new Float32Array([0.2]);
    smoothStep(prev, new Float32Array([1]), 0, taus(0.5));
    expect(prev[0]).toBeCloseTo(0.2);
  });

  it('reaches 95% of a rise within three attack times, and falls more slowly', () => {
    const t = taus(0.5);
    const up = new Float32Array([0]);
    for (let i = 0; i < 30; i += 1) smoothStep(up, new Float32Array([1]), t.attack / 10, t);
    expect(up[0]).toBeGreaterThan(0.95);
    const down = new Float32Array([1]);
    for (let i = 0; i < 30; i += 1) smoothStep(down, new Float32Array([0]), t.attack / 10, t);
    expect(down[0]).toBeGreaterThan(0.05);
  });
});

describe('peakStep', () => {
  const run = (
    level: number,
    seconds: number,
    peak: Float32Array,
    vel: Float32Array,
    hold: Float32Array,
  ) => {
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i += 1)
      peakStep(peak, vel, hold, new Float32Array([level]), dt, PEAK);
  };

  it('holds, then falls, and never drops below the level', () => {
    const peak = new Float32Array([0]);
    const vel = new Float32Array([0]);
    const hold = new Float32Array([0]);
    run(1, 0.1, peak, vel, hold);
    expect(peak[0]).toBe(1);
    run(0.2, 0.25, peak, vel, hold);
    expect(peak[0]).toBe(1); // still holding
    run(0.2, 0.3, peak, vel, hold);
    expect(peak[0]).toBeLessThan(1);
    expect(peak[0]).toBeGreaterThanOrEqual(0.2);
    run(0.2, 2, peak, vel, hold);
    expect(peak[0]).toBeCloseTo(0.2, 5);
  });

  it('resets on a new high and clamps at the floor', () => {
    const peak = new Float32Array([0.5]);
    const vel = new Float32Array([3]);
    const hold = new Float32Array([0]);
    peakStep(peak, vel, hold, new Float32Array([0.8]), 1 / 60, PEAK);
    expect(peak[0]).toBeCloseTo(0.8, 5);
    expect(vel[0]).toBe(0);
    expect(hold[0]).toBeCloseTo(PEAK.hold, 5);
    run(0, 3, peak, vel, hold);
    expect(peak[0]).toBe(0);
  });
});
