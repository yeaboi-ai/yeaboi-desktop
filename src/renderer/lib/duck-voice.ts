// The duck's voice — ported from the old shell's ambience.ts, minus the
// sidecar API calls. The quip table is local now (duck-events.ts): the old
// backend served it so two surfaces could share one vocabulary; the desktop
// is the only surface left.

export const PRIORITY_STICKY = 0; // a question waiting for an answer — never fades
export const PRIORITY_EVENT = 1;
export const PRIORITY_COACH = 2;

/** How long a line dwells before it fades. Coaching lingers a little longer. */
export const HOLD_MS = 2_600;
export const COACH_HOLD_MS = 4_000;

export interface DuckLine {
  text: string;
  priority: number;
  hold: number;
  seq: number;
  at: number;
}

/**
 * Decides what the duck says, one line at a time.
 *
 * Lower priority numbers win. A line still showing at a higher priority keeps
 * the bubble — a coaching nudge never interrupts a quip — and offering the text
 * already showing is a no-op rather than a restarted fade. There is deliberately
 * no ambient tier: rotating tips were tried in the terminal's bubble and read as
 * noise, so the duck speaks only when something actually happened.
 */
export class DuckVoice {
  private seq = 0;
  private line: DuckLine | null = null;
  muted = false;

  mute(muted: boolean): void {
    this.muted = muted;
    if (muted) this.line = null;
  }

  private expired(line: DuckLine, now: number): boolean {
    if (line.priority === PRIORITY_STICKY) return false; // waits for clearSticky, never the clock
    return now - line.at > line.hold;
  }

  /** Offer the duck a line. Returns whether he took the bubble. */
  say(text: string, priority = PRIORITY_EVENT, hold = HOLD_MS, now = Date.now()): boolean {
    if (this.muted || !text) return false;
    const live = this.line !== null && !this.expired(this.line, now);
    if (live && this.line && priority > this.line.priority) return false;
    if (live && this.line && this.line.text === text && this.line.priority === priority)
      return true;
    this.seq += 1;
    this.line = { text, priority, hold, seq: this.seq, at: now };
    return true;
  }

  /** A line that waits for an answer — full brightness until cleared. */
  saySticky(text: string, now = Date.now()): boolean {
    return this.say(text, PRIORITY_STICKY, Number.POSITIVE_INFINITY, now);
  }

  clearSticky(): void {
    if (this.line !== null && this.line.priority === PRIORITY_STICKY) this.line = null;
  }

  get sticky(): boolean {
    return this.line !== null && this.line.priority === PRIORITY_STICKY;
  }

  /** The line to draw this frame, or null. */
  tick(now = Date.now()): DuckLine | null {
    if (this.line === null || this.expired(this.line, now)) return null;
    return this.line;
  }
}

/** The app-wide voice. One window, one duck. */
let voice: DuckVoice | null = null;

export function duckVoice(): DuckVoice {
  if (voice === null) voice = new DuckVoice();
  return voice;
}
