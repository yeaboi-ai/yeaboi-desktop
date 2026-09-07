// The frame pipeline, the synthetic stand-in, and the one shared loop.

import { describe, expect, it } from 'vitest';
import {
  createVizState,
  rmsOf,
  stepFrame,
  VIZ_BAND_COUNT,
} from '../src/renderer/lib/music/viz/frame';
import { vizMode } from '../src/renderer/lib/music/viz/mode';
import {
  createVizSource,
  tickInput,
  type VizSourceDeps,
} from '../src/renderer/lib/music/viz/source';
import { syntheticSpectrum, syntheticStep } from '../src/renderer/lib/music/viz/synthetic';

const OPTS = { gain: 1, smoothing: 0.5, peaks: true };

describe('createVizState and stepFrame', () => {
  it('shapes the arrays for the analyser', () => {
    const state = createVizState(48_000, 2048);
    expect(state.bands).toHaveLength(VIZ_BAND_COUNT);
    expect(state.bins).toHaveLength(1024);
    expect(state.wave).toHaveLength(2048);
    expect(state.edges).toHaveLength(VIZ_BAND_COUNT + 1);
  });

  it('reads silence as nothing', () => {
    const state = createVizState(48_000, 2048);
    const frame = stepFrame(
      state,
      new Uint8Array(1024),
      new Uint8Array(2048).fill(128),
      1 / 60,
      OPTS,
    );
    expect(Math.max(...frame.bands)).toBe(0);
    expect(frame.rms).toBe(0);
    expect(frame.t).toBeCloseTo(1 / 60);
  });

  it('reads a full-scale square wave as loud', () => {
    const square = new Float32Array(64).map((_, i) => (i % 2 ? 1 : -1));
    expect(rmsOf(square)).toBe(1);
    const bytes = new Uint8Array(2048).map((_, i) => (i % 2 ? 255 : 1));
    const state = createVizState(48_000, 2048);
    expect(stepFrame(state, new Uint8Array(1024), bytes, 1 / 60, OPTS).rms).toBe(1);
  });

  it('clamps a wild delta so a hidden hour is not replayed', () => {
    const state = createVizState(48_000, 2048);
    stepFrame(state, new Uint8Array(1024), new Uint8Array(2048), 3600, OPTS);
    expect(state.t).toBe(0.1);
  });
});

describe('the synthetic stand-in', () => {
  it('is deterministic for a phase and moves between phases', () => {
    const a = new Uint8Array(1024);
    const b = new Uint8Array(1024);
    const w = new Uint8Array(2048);
    syntheticSpectrum(1, a, w, 48_000);
    syntheticSpectrum(1, b, w, 48_000);
    expect(Array.from(a)).toEqual(Array.from(b));
    syntheticSpectrum(2, b, w, 48_000);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('stays inside the byte range and yields bands in 0..1 through the same pipeline', () => {
    const state = createVizState(48_000, 2048);
    for (let i = 0; i < 120; i += 1) syntheticStep(state, 1 / 60, OPTS);
    for (const v of state.bins) expect(v).toBeLessThanOrEqual(255);
    expect(Math.max(...state.bands)).toBeGreaterThan(0);
    for (const v of state.bands) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('vizMode and tickInput', () => {
  it('maps every playback status', () => {
    expect(vizMode('playing')).toBe('live');
    expect(vizMode('connecting')).toBe('connecting');
    expect(vizMode('paused')).toBe('paused');
    expect(vizMode('failed')).toBe('failed');
    expect(vizMode('stopped')).toBe('off');
  });

  it('feeds the analyser only when live and present', () => {
    expect(tickInput('live', true)).toBe('analyser');
    expect(tickInput('live', false)).toBe('synthetic');
    expect(tickInput('connecting', true)).toBe('synthetic');
    expect(tickInput('paused', true)).toBe('decay');
    expect(tickInput('off', true)).toBe('none');
    expect(tickInput('failed', false)).toBe('none');
  });
});

describe('createVizSource', () => {
  function fakeLoop(hidden = () => false) {
    const queue: ((t: number) => void)[] = [];
    let clock = 0;
    const deps: VizSourceDeps = {
      now: () => clock,
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {
        queue.length = 0;
      },
      hidden,
    };
    const flush = (ms = 16) => {
      clock += ms;
      const pending = queue.splice(0);
      for (const cb of pending) cb(clock);
    };
    return { deps, flush, queued: () => queue.length };
  }

  it('runs only with a subscriber and a live mode', () => {
    const loop = fakeLoop();
    const source = createVizSource(loop.deps);
    expect(loop.queued()).toBe(0);
    source.set({ analyser: null, mode: 'live', opts: OPTS });
    expect(loop.queued()).toBe(0);
    let calls = 0;
    const off = source.subscribe(() => (calls += 1));
    expect(calls).toBe(1);
    expect(loop.queued()).toBe(1);
    loop.flush();
    loop.flush();
    expect(calls).toBe(3);
    expect(source.stats().running).toBe(true);
    off();
    expect(loop.queued()).toBe(0);
  });

  it('falls away on pause rather than freezing, and zeroes on off', () => {
    const loop = fakeLoop();
    const source = createVizSource(loop.deps);
    const modes: string[] = [];
    source.subscribe((_frame, mode) => modes.push(mode));
    source.set({ analyser: null, mode: 'live', opts: OPTS });
    loop.flush();
    loop.flush();
    const loudest = () => Math.max(...source.current().frame.bands);
    const wasLoud = loudest();
    expect(wasLoud).toBeGreaterThan(0);

    // Paused keeps the loop for as long as the frame takes to fall.
    source.set({ analyser: null, mode: 'paused', opts: OPTS });
    expect(loop.queued()).toBe(1);
    loop.flush();
    expect(modes.at(-1)).toBe('paused');
    expect(loudest()).toBeLessThan(wasLoud);
    expect(loudest()).toBeGreaterThan(0);

    // …and lets go of it once there is nothing left to draw.
    for (let i = 0; i < 1000 && loop.queued() > 0; i += 1) loop.flush();
    expect(loop.queued()).toBe(0);
    expect(source.current().frame.bands.every((v) => v === 0)).toBe(true);

    source.set({ analyser: null, mode: 'off', opts: OPTS });
    expect(source.current().frame.bands.every((v) => v === 0)).toBe(true);
    expect(modes.at(-1)).toBe('off');
  });

  it('does not run while the window is hidden', () => {
    let hidden = true;
    const loop = fakeLoop(() => hidden);
    const source = createVizSource(loop.deps);
    source.subscribe(() => undefined);
    source.set({ analyser: null, mode: 'live', opts: OPTS });
    expect(loop.queued()).toBe(0);
    hidden = false;
    source.visibility();
    expect(loop.queued()).toBe(1);
    source.dispose();
    expect(loop.queued()).toBe(0);
  });
});
