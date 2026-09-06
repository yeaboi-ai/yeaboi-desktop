// The stand-in before the graph exists, and what the style tiles play: a
// spectrum and a wave written into the same scratch arrays the real path
// reads, so smoothing and peaks behave identically either way.

import { F_MAX, F_MIN } from './bands';
import { stepFrame, type VizFrame, type VizOptions, type VizState } from './frame';

export const SYNTHETIC_SPEED = 2.2;

/** Fill `bins` and `waveBytes` for a clock value. Deterministic in `phase`. */
export function syntheticSpectrum(
  phase: number,
  bins: Uint8Array,
  waveBytes: Uint8Array,
  sampleRate: number,
): void {
  const binWidth = sampleRate / (bins.length * 2);
  const span = Math.log(F_MAX / F_MIN);
  const swell = 0.75 + 0.25 * Math.sin(phase * 0.6);
  for (let k = 0; k < bins.length; k += 1) {
    const f = Math.max(F_MIN, k * binWidth);
    const u = Math.min(1, Math.log(f / F_MIN) / span);
    const shape = (Math.sin(phase + u * 44.8) + Math.sin(phase * 1.7 + u * 64) + 2) / 4;
    const slope = 1 - 0.45 * u;
    bins[k] = Math.round(255 * 0.7 * shape * slope * swell);
  }
  const n = waveBytes.length;
  const amp = 100 * (0.5 + 0.5 * Math.sin(phase * 0.9));
  for (let i = 0; i < n; i += 1) {
    waveBytes[i] = Math.round(128 + amp * Math.sin((2 * Math.PI * 3 * i) / n + phase));
  }
}

/** Advance the synthetic clock and step, as if an analyser had answered. */
export function syntheticStep(state: VizState, dt: number, opts: VizOptions): VizFrame {
  const step = Math.min(0.1, Math.max(0, dt));
  state.phase += step * SYNTHETIC_SPEED;
  syntheticSpectrum(state.phase, state.bins, state.waveBytes, state.sampleRate);
  return stepFrame(state, state.bins, state.waveBytes, step, opts);
}
