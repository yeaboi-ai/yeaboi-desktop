// The notification sounds, synthesized rather than shipped: a handful of tones
// built out of oscillators and a plucked string, so there is no asset to load
// and every platform hears the same thing.

import { DEFAULT_CHIME, type ChimeId } from '@shared/pet-prefs';

type Voice = (ctx: AudioContext, at: number) => void;

/** One decaying partial: a sine or triangle struck and left to fall away. */
function partial(
  ctx: AudioContext,
  at: number,
  {
    freq,
    gain,
    duration,
    type = 'sine',
    delay = 0,
  }: { freq: number; gain: number; duration: number; type?: OscillatorType; delay?: number },
): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = at + delay;
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A struck string: a noise burst fed through its own delayed feedback. The
 *  cheapest way to something that sounds played rather than beeped. */
function pluck(ctx: AudioContext, at: number, freq: number, decay: number): void {
  const seconds = 1 / freq;
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;

  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = seconds;
  const feedback = ctx.createGain();
  feedback.gain.value = decay;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 4200;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.5, at);
  out.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);

  noise.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  delay.connect(out);
  out.connect(ctx.destination);
  noise.start(at);
  noise.stop(at + seconds);
}

const VOICES: Record<ChimeId, Voice> = {
  // Two short sine pulses — the one yeaboi has always made.
  ding: (ctx, at) => {
    partial(ctx, at, { freq: 880, gain: 0.18, duration: 0.12 });
    partial(ctx, at, { freq: 1320, gain: 0.18, duration: 0.16, delay: 0.08 });
  },
  // A wooden bar: a fundamental with its fourth partial, gone in a moment.
  marimba: (ctx, at) => {
    partial(ctx, at, { freq: 784, gain: 0.22, duration: 0.28, type: 'triangle' });
    partial(ctx, at, { freq: 3136, gain: 0.05, duration: 0.1, type: 'sine' });
    partial(ctx, at, { freq: 1176, gain: 0.06, duration: 0.18, delay: 0.09, type: 'triangle' });
  },
  // Inharmonic partials over a long tail: a small struck bell.
  bell: (ctx, at) => {
    partial(ctx, at, { freq: 659, gain: 0.16, duration: 1.6 });
    partial(ctx, at, { freq: 1319, gain: 0.07, duration: 1.1 });
    partial(ctx, at, { freq: 1978, gain: 0.04, duration: 0.7 });
    partial(ctx, at, { freq: 2637, gain: 0.02, duration: 0.4 });
  },
  // A plucked string, two notes of it.
  pluck: (ctx, at) => {
    pluck(ctx, at, 587, 0.93);
    pluck(ctx, at + 0.11, 880, 0.9);
  },
  // Low to high, soft: something arrived.
  rise: (ctx, at) => {
    partial(ctx, at, { freq: 523, gain: 0.14, duration: 0.22, type: 'triangle' });
    partial(ctx, at, { freq: 784, gain: 0.14, duration: 0.3, delay: 0.1, type: 'triangle' });
  },
  // High to low: something is done with.
  drop: (ctx, at) => {
    partial(ctx, at, { freq: 988, gain: 0.14, duration: 0.18, type: 'triangle' });
    partial(ctx, at, { freq: 659, gain: 0.16, duration: 0.34, delay: 0.09, type: 'triangle' });
  },
};

/** Play one of them. Silent, never throwing, where there is no audio at all. */
export function playChime(id: ChimeId = DEFAULT_CHIME): void {
  try {
    const Ctx =
      (
        window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    (VOICES[id] ?? VOICES[DEFAULT_CHIME])(ctx, ctx.currentTime);
    setTimeout(() => ctx.close().catch(() => {}), 2200);
  } catch {
    /* no-op — audio is a soft enhancement */
  }
}

/** A notification is redundant while you are looking straight at the app. */
export function windowFocused(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden && document.hasFocus();
}
