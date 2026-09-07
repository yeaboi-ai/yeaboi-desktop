// One loop, however many canvases. The analyser is read once per frame and the
// frame is handed to every subscriber; the loop runs only while something is
// mounted, the radio is live, and the window is visible.
//
// The clock, rAF and the visibility check are injected, so the start/stop rules
// are testable with a fake frame loop.

import {
  VIZ_BAND_COUNT,
  createVizState,
  decayFrame,
  resetFrame,
  analyserFrame,
  type VizFrame,
  type VizOptions,
  type VizState,
} from './frame';
import type { VizMode } from './mode';
import { syntheticStep } from './synthetic';

export type VizListener = (frame: VizFrame, mode: VizMode) => void;

export interface VizInput {
  analyser: AnalyserNode | null;
  mode: VizMode;
  opts: VizOptions;
}

export interface VizFrameSource {
  subscribe(listener: VizListener): () => void;
  /** The last frame, for a static paint. */
  current(): { frame: VizFrame; mode: VizMode };
  set(input: VizInput): void;
  /** Called when the window is hidden or shown again. */
  visibility(): void;
  /** Dev aid: what the loop is doing. */
  stats(): { subscribers: number; running: boolean; fps: number; lastFrameMs: number };
  /** Stop the loop without forgetting anything; the next set or subscribe restarts it. */
  pause(): void;
  dispose(): void;
}

export interface VizSourceDeps {
  now: () => number;
  raf: (callback: (t: number) => void) => number;
  caf: (id: number) => void;
  hidden: () => boolean;
}

export type TickInput = 'analyser' | 'synthetic' | 'decay' | 'none';

/** Which input feeds a frame for a mode. */
export function tickInput(mode: VizMode, hasAnalyser: boolean): TickInput {
  if (mode === 'live') return hasAnalyser ? 'analyser' : 'synthetic';
  if (mode === 'connecting') return 'synthetic';
  // Paused keeps the loop only long enough to let the frame fall away.
  if (mode === 'paused') return 'decay';
  return 'none';
}

const DEFAULT_RATE = 48_000;
const DEFAULT_FFT = 2048;
/** Below this a frame has nothing worth holding on to. */
const QUIET = 0.02;

function loudest(bands: Float32Array): number {
  let most = 0;
  for (let i = 0; i < bands.length; i += 1) if (bands[i]! > most) most = bands[i]!;
  return most;
}

export function createVizSource(deps: VizSourceDeps): VizFrameSource {
  const listeners = new Set<VizListener>();
  let state: VizState = createVizState(DEFAULT_RATE, DEFAULT_FFT);
  let input: VizInput = {
    analyser: null,
    mode: 'off',
    opts: { gain: 1, smoothing: 0.5, peaks: true },
  };
  let frame = 0;
  let last = 0;
  let disposed = false;
  let fps = 0;
  /** Set once a paused frame has finished falling; cleared by the next mode. */
  let settled = false;
  // The last frame with anything in it. Pausing stops the audio a moment
  // before the mode changes, so by the time "paused" arrives the analyser has
  // already read silence — the fall starts from here rather than from nothing.
  const held = {
    bands: new Float32Array(VIZ_BAND_COUNT),
    peaks: new Float32Array(VIZ_BAND_COUNT),
    loud: 0,
  };
  let lastFrameMs = 0;
  let frames = 0;
  let fpsStamp = 0;

  const emit = (): void => {
    for (const listener of listeners) listener(state, input.mode);
  };

  const shouldRun = (): boolean => {
    if (disposed || listeners.size === 0 || deps.hidden()) return false;
    const kind = tickInput(input.mode, input.analyser !== null);
    if (kind === 'none') return false;
    return !(kind === 'decay' && settled);
  };

  const tick = (now: number): void => {
    frame = 0;
    if (!shouldRun()) {
      fps = 0;
      return;
    }
    const started = deps.now();
    const dt = last === 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const kind = tickInput(input.mode, input.analyser !== null);
    if (kind === 'analyser' && input.analyser) {
      analyserFrame(input.analyser, state, dt, input.opts);
    } else if (kind === 'decay') {
      settled = decayFrame(state, dt);
    } else {
      syntheticStep(state, dt, input.opts);
    }
    if (kind !== 'decay') {
      const loud = loudest(state.bands);
      if (loud > QUIET) {
        held.bands.set(state.bands);
        held.peaks.set(state.peaks);
        held.loud = loud;
      }
    }
    emit();
    // The frame that reached silence is drawn before the loop lets go of it.
    if (settled) {
      stop();
      return;
    }
    lastFrameMs = deps.now() - started;
    frames += 1;
    if (now - fpsStamp >= 1000) {
      fps = frames;
      frames = 0;
      fpsStamp = now;
    }
    frame = deps.raf(tick);
  };

  const start = (): void => {
    if (frame || !shouldRun()) return;
    last = 0;
    frame = deps.raf(tick);
  };

  const stop = (): void => {
    if (frame) deps.caf(frame);
    frame = 0;
    fps = 0;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(state, input.mode);
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    current() {
      return { frame: state, mode: input.mode };
    },
    set(next) {
      const before = input;
      if (before.mode !== next.mode) settled = false;
      if (next.mode === 'paused' && before.mode !== 'paused' && loudest(state.bands) < held.loud) {
        state.bands.set(held.bands);
        state.peaks.set(held.peaks);
        state.fall = 1;
      }
      input = next;
      if (next.analyser && next.analyser.context.sampleRate !== state.sampleRate) {
        state = createVizState(next.analyser.context.sampleRate, next.analyser.fftSize);
      }
      const running = tickInput(next.mode, next.analyser !== null) !== 'none';
      if (!running) {
        stop();
        if (next.mode === 'off' || next.mode === 'failed') {
          resetFrame(state);
          held.loud = 0;
        }
        // One repaint so the canvases show the floor or the frozen frame.
        if (before.mode !== next.mode) emit();
        return;
      }
      start();
    },
    visibility() {
      if (deps.hidden()) stop();
      else start();
    },
    stats() {
      return { subscribers: listeners.size, running: frame !== 0, fps, lastFrameMs };
    },
    pause() {
      stop();
    },
    dispose() {
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}
