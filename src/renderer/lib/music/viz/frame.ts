// One frame of the sound: 64 log-spaced bands, their peaks, the raw wave and
// its loudness. The state owns every array and mutates in place, so a frame
// allocates nothing. `stepFrame` is the pure core; `analyserFrame` is the one
// edge that touches the Web Audio node.

import { applyGain, bandsFromBins, logBandEdges } from './bands';
import { PEAK, peakStep, smoothStep, taus } from './smooth';

export const VIZ_BAND_COUNT = 64;

export interface VizFrame {
  /** 0..1 per band after gain and smoothing. Always VIZ_BAND_COUNT long. */
  bands: Float32Array;
  /** 0..1 per band, the held peak. */
  peaks: Float32Array;
  /** -1..1 per time-domain sample. */
  wave: Float32Array;
  /** 0..1 loudness from the wave. */
  rms: number;
  /** Seconds since the state was made; painters that idle-animate read it. */
  t: number;
  /** 1 while something is sounding, falling to 0 as a paused frame dies away.
   *  The colour rides it down, so pausing dims rather than switches. */
  fall: number;
}

export interface VizOptions {
  gain: number;
  smoothing: number;
  peaks: boolean;
}

export interface VizState extends VizFrame {
  sampleRate: number;
  fftSize: number;
  edges: Float32Array;
  raw: Float32Array;
  peakVel: Float32Array;
  peakHold: Float32Array;
  bins: Uint8Array<ArrayBuffer>;
  waveBytes: Uint8Array<ArrayBuffer>;
  /** The synthetic clock, for frames drawn with no analyser. */
  phase: number;
}

export function createVizState(sampleRate: number, fftSize: number): VizState {
  const n = VIZ_BAND_COUNT;
  return {
    sampleRate,
    fftSize,
    edges: logBandEdges(fftSize / 2, sampleRate, n),
    bands: new Float32Array(n),
    peaks: new Float32Array(n),
    raw: new Float32Array(n),
    peakVel: new Float32Array(n),
    peakHold: new Float32Array(n),
    wave: new Float32Array(fftSize),
    bins: new Uint8Array(new ArrayBuffer(fftSize / 2)),
    waveBytes: new Uint8Array(new ArrayBuffer(fftSize)),
    rms: 0,
    t: 0,
    fall: 1,
    phase: 0,
  };
}

export function rmsOf(wave: Float32Array): number {
  if (wave.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < wave.length; i += 1) sum += wave[i]! * wave[i]!;
  return Math.sqrt(sum / wave.length);
}

/** How long a paused frame takes to fall away, in seconds of e-folding. */
const DECAY_TAU = 0.6;
/** Below this a band is nothing, and rounding it to nothing is what lets the
 *  loop know it has finished. */
const SILENT = 0.002;

/** Let a frame fall to silence rather than freezing where the sound stopped:
 *  what "paused" shows on its way down. Returns true once nothing is left. */
export function decayFrame(state: VizState, dt: number): boolean {
  const step = Math.min(0.1, Math.max(0, dt));
  const keep = Math.exp(-step / DECAY_TAU);
  let loudest = 0;
  for (let i = 0; i < state.bands.length; i += 1) {
    const band = state.bands[i]! * keep;
    const peak = state.peaks[i]! * keep;
    state.bands[i] = band < SILENT ? 0 : band;
    state.peaks[i] = peak < SILENT ? 0 : peak;
    loudest = Math.max(loudest, state.bands[i]!, state.peaks[i]!);
  }
  for (let i = 0; i < state.wave.length; i += 1) state.wave[i] = state.wave[i]! * keep;
  state.rms *= keep;
  state.t += step;
  state.fall = loudest === 0 ? 0 : state.fall * keep;
  return loudest === 0;
}

/** Zero the live parts of a frame: what "off" and "failed" show. */
export function resetFrame(state: VizState): void {
  state.bands.fill(0);
  state.peaks.fill(0);
  state.raw.fill(0);
  state.peakVel.fill(0);
  state.peakHold.fill(0);
  state.wave.fill(0);
  state.rms = 0;
  state.fall = 0;
}

/** One tick from byte spectra. Mutates and returns `state`. */
export function stepFrame(
  state: VizState,
  bins: ArrayLike<number>,
  waveBytes: ArrayLike<number>,
  dt: number,
  opts: VizOptions,
): VizFrame {
  const step = Math.min(0.1, Math.max(0, dt));
  bandsFromBins(bins, state.edges, state.raw);
  applyGain(state.raw, opts.gain);
  smoothStep(state.bands, state.raw, step, taus(opts.smoothing));
  if (opts.peaks) {
    peakStep(state.peaks, state.peakVel, state.peakHold, state.bands, step, PEAK);
  } else {
    state.peaks.set(state.bands);
  }
  // The wave at a working volume is a few percent of full scale; the gain
  // lifts it the way it lifts the bands, so the oscilloscope has a shape.
  const n = Math.min(state.wave.length, waveBytes.length);
  const lift = 2 * opts.gain;
  for (let i = 0; i < n; i += 1) {
    const v = (((waveBytes[i] ?? 128) - 128) / 128) * lift;
    state.wave[i] = Math.min(1, Math.max(-1, v));
  }
  state.rms = Math.min(1, rmsOf(state.wave) * 1.25);
  state.t += step;
  state.fall = 1;
  return state;
}

/** Read the analyser into the scratch arrays, then step. Rebuilds the state's
 *  edges when the node's size or rate differ from what the state was made for. */
export function analyserFrame(
  analyser: AnalyserNode,
  state: VizState,
  dt: number,
  opts: VizOptions,
): VizFrame {
  const rate = analyser.context.sampleRate;
  if (analyser.fftSize !== state.fftSize || rate !== state.sampleRate) {
    state.fftSize = analyser.fftSize;
    state.sampleRate = rate;
    state.edges = logBandEdges(analyser.frequencyBinCount, rate, VIZ_BAND_COUNT);
    state.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    state.waveBytes = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    state.wave = new Float32Array(analyser.fftSize);
  }
  analyser.getByteFrequencyData(state.bins);
  analyser.getByteTimeDomainData(state.waveBytes);
  return stepFrame(state, state.bins, state.waveBytes, dt, opts);
}
