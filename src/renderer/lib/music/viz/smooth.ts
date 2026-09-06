// The feel: how fast a bar rises, how slowly it falls, and how a peak cap
// hangs then drops. All frame-rate independent, so 30 fps under load looks
// like 60.

export interface Taus {
  /** Seconds to reach ~63% of a rise. */
  attack: number;
  /** Seconds to lose ~63% of a fall. */
  decay: number;
}

export const PEAK = { hold: 0.3, gravity: 4.0 } as const;

/** Attack 12–62 ms, decay 60–460 ms across the 0..1 preference. */
export function taus(smoothing: number): Taus {
  const s = Math.min(1, Math.max(0, Number.isFinite(smoothing) ? smoothing : 0.5));
  return { attack: 0.012 + 0.05 * s, decay: 0.06 + 0.4 * s };
}

/** One asymmetric first-order step per band, in place on `prev`. */
export function smoothStep(prev: Float32Array, target: Float32Array, dt: number, t: Taus): void {
  const n = Math.min(prev.length, target.length);
  if (dt <= 0) return;
  const up = 1 - Math.exp(-dt / t.attack);
  const down = 1 - Math.exp(-dt / t.decay);
  for (let i = 0; i < n; i += 1) {
    const from = prev[i]!;
    const to = target[i]!;
    prev[i] = from + (to - from) * (to > from ? up : down);
  }
}

/** Peak hold with gravity: a new high resets the cap, it holds for a moment,
 *  then falls faster and faster, never below the live level. */
export function peakStep(
  peak: Float32Array,
  vel: Float32Array,
  hold: Float32Array,
  level: Float32Array,
  dt: number,
  opts: { hold: number; gravity: number } = PEAK,
): void {
  const n = Math.min(peak.length, level.length);
  for (let i = 0; i < n; i += 1) {
    const live = level[i]!;
    if (live >= peak[i]!) {
      peak[i] = live;
      vel[i] = 0;
      hold[i] = opts.hold;
      continue;
    }
    hold[i] = Math.max(0, hold[i]! - dt);
    if (hold[i] === 0) {
      vel[i] = vel[i]! + opts.gravity * dt;
      peak[i] = Math.max(live, peak[i]! - vel[i]! * dt);
    }
  }
}
