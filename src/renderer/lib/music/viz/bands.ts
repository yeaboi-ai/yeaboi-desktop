// Bins to bands, on the scale the ear uses.
//
// An FFT hands back equal-width bins, so a linear mapping spends most of its
// columns on the top octaves, where a 128 kbps stream has nothing, and packs
// everything a person hears into the first few. A log scale gives each octave
// the same width: bass on the left, air on the right, and the middle where
// the music is.

/** Below this a stream is rumble; above it an MP3 has been low-passed. */
export const F_MIN = 40;
export const F_MAX = 16_000;
/** High-end lift against music's pink slope, so the right third is not empty. */
export const TILT = 0.35;

/**
 * `bandCount + 1` fractional bin positions, log-spaced in frequency.
 *
 * `binCount` is `fftSize / 2`; the bin width is `sampleRate / fftSize`.
 * Edges are clamped to the bins and kept strictly increasing.
 */
export function logBandEdges(
  binCount: number,
  sampleRate: number,
  bandCount: number,
  fMin = F_MIN,
  fMax = F_MAX,
): Float32Array {
  const edges = new Float32Array(Math.max(0, bandCount) + 1);
  if (bandCount <= 0 || binCount <= 0 || sampleRate <= 0) return edges;
  const binWidth = sampleRate / (binCount * 2);
  const top = Math.min(fMax, 0.95 * (sampleRate / 2));
  const low = Math.min(fMin, top / 2);
  const ratio = top / low;
  let previous = -1;
  for (let i = 0; i <= bandCount; i += 1) {
    const f = low * Math.pow(ratio, i / bandCount);
    let b = f / binWidth;
    b = Math.min(binCount - 1, Math.max(0, b));
    if (b <= previous) b = previous + 1e-3;
    edges[i] = b;
    previous = b;
  }
  return edges;
}

/** Each band's 0..1 level from byte bins: the mean across a wide band, an
 *  interpolation inside a band narrower than one bin. */
export function bandsFromBins(
  bins: ArrayLike<number>,
  edges: Float32Array,
  out: Float32Array,
): void {
  const last = bins.length - 1;
  const bands = Math.min(out.length, edges.length - 1);
  for (let i = 0; i < bands; i += 1) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    let value = 0;
    if (last < 0) {
      value = 0;
    } else if (hi - lo >= 1) {
      const from = Math.min(last, Math.floor(lo));
      const to = Math.min(last, Math.max(from, Math.ceil(hi) - 1));
      let sum = 0;
      for (let k = from; k <= to; k += 1) sum += bins[k] ?? 0;
      value = sum / (to - from + 1);
    } else {
      const c = (lo + hi) / 2;
      const k = Math.min(last, Math.floor(c));
      const next = Math.min(last, k + 1);
      const a = bins[k] ?? 0;
      const b = bins[next] ?? a;
      value = a + (b - a) * (c - k);
    }
    out[i] = Math.min(1, Math.max(0, value / 255));
  }
  for (let i = bands; i < out.length; i += 1) out[i] = 0;
}

/** Lift, tilt and the person's gain, in place, clamped to 0..1. */
export function applyGain(levels: Float32Array, gain: number): void {
  const n = levels.length;
  for (let i = 0; i < n; i += 1) {
    const tilt = 1 + TILT * (n > 1 ? i / (n - 1) : 0);
    // Byte spectra are already decibel-mapped and sit high; the curve opens
    // the top so a loud column and a full one are different things.
    const v = Math.pow(Math.max(0, levels[i]!), 1.4) * 1.05 * gain * tilt;
    levels[i] = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  }
}

/** `bands` → `out.length` columns by the max of each group. Max, not mean: at
 *  four columns a mean makes the pocket look asleep. */
export function regroupBands(bands: Float32Array, out: Float32Array): void {
  const n = out.length;
  if (n === 0) return;
  const group = Math.max(1, Math.floor(bands.length / n));
  for (let j = 0; j < n; j += 1) {
    let top = 0;
    const from = j * group;
    const to = j === n - 1 ? bands.length : Math.min(bands.length, from + group);
    for (let k = from; k < to; k += 1) top = Math.max(top, bands[k]!);
    out[j] = top;
  }
}
