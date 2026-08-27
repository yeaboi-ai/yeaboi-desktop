// Soft synthesized "ding" via Web Audio API. Avoids shipping an asset and
// keeps cross-platform behaviour identical. Two short sine pulses, ~120ms.

export function playChime(): void {
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
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    };
    tone(880, 0, 0.12);
    tone(1320, 0.08, 0.16);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* no-op — audio is a soft enhancement */
  }
}

/** A notification is redundant while you are looking straight at the app. */
export function windowFocused(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden && document.hasFocus();
}
