// What every screensaver scene is.
//
// `step` and `draw` are separate so a simulation can be advanced in a test with
// no canvas — this repo's vitest runs in a Node environment and collects only
// test/**/*.test.ts, so anything worth asserting has to be reachable without a
// DOM. Scenes take their randomness as a parameter for the same reason: seeded,
// a yard is reproducible and its invariants are testable.

import type { DuckArt } from './duck-rig';
import type { Palette } from './palette';

export interface Scene {
  /**
   * Hand the scene the duck artwork once it has loaded.
   *
   * Every scene draws the mascot, and none of them may import the art: that
   * would make the module unloadable in a Node test. So the art arrives from
   * the outside, and a scene draws whatever it can until it does.
   */
  setArt(art: DuckArt): void;
  /** Advance the simulation by `dt` seconds. Never touches a canvas. */
  step(dt: number): void;
  /** Paint the current state. Never advances anything. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** The window changed size. */
  resize(width: number, height: number): void;
  /** A theme changed under us. */
  repalette(palette: Palette): void;
}

export interface SceneOptions {
  width: number;
  height: number;
  palette: Palette;
  random: () => number;
  /** Draw a still frame instead of a moving one (prefers-reduced-motion). */
  still?: boolean;
}

/**
 * A small deterministic PRNG (mulberry32).
 *
 * Math.random cannot be seeded, and a screensaver whose layout cannot be
 * reproduced cannot have its physics asserted.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [min, max). */
export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}
