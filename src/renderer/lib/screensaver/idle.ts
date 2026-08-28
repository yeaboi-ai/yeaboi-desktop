// Idle tracking for the screensaver — a port of IdleController in
// yeaboi.ai's src/yeaboi/ui/shared/_screensaver.py.
//
// Ported rather than shared, for the same reason DuckVoice was: what crosses
// the wire is the threshold and the chosen style, not the arbitration. The
// three behaviours worth carrying over are the ones a naive idle timer gets
// wrong:
//
//   * work time never counts. A run that streams for ten minutes is not ten
//     minutes of idleness, so anything long-running pushes a suppression.
//   * the event that wakes the saver is swallowed. Dismissing must not also
//     click whatever the pointer happened to be over.
//   * suppression refuses a manual show too, so the preview shortcut is inert
//     mid-run rather than briefly covering the thing being watched.
//
// The clock is a parameter throughout: every method takes `now` in
// milliseconds, so the whole class is testable without timers.

export const DEFAULT_IDLE_SECONDS = 300;

export class IdleController {
  private lastActivity: number;
  private animationStarted: number;
  private suppressionDepth = 0;
  private active = false;

  constructor(
    /** How long the app waits on a person before taking the window over. */
    public idleSeconds: number = DEFAULT_IDLE_SECONDS,
    now = 0,
  ) {
    this.lastActivity = now;
    this.animationStarted = now;
  }

  /** Whether the saver is currently covering the window. */
  get showing(): boolean {
    return this.active;
  }

  /**
   * Record a real user event. Returns true when it was a wake-only event —
   * the caller must then swallow it rather than acting on it.
   */
  noteActivity(now: number): boolean {
    this.lastActivity = now;
    if (this.active) {
      this.active = false;
      this.animationStarted = now;
      return true;
    }
    return false;
  }

  /** Whether the saver should be covering the window at `now`. */
  shouldShow(now: number): boolean {
    if (this.suppressionDepth > 0) {
      this.active = false;
      return false;
    }
    if (!this.active && now - this.lastActivity >= this.idleSeconds * 1000) {
      this.active = true;
      this.animationStarted = now;
    }
    return this.active;
  }

  /** Seconds the current saver session has been running. */
  animationElapsed(now: number): number {
    return Math.max(0, (now - this.animationStarted) / 1000);
  }

  /** Activate immediately, for the preview shortcut. False while suppressed. */
  showNow(now: number): boolean {
    if (this.suppressionDepth > 0) return false;
    this.active = true;
    this.animationStarted = now;
    return true;
  }

  /** Exclude a long-running operation from idle tracking. */
  pushSuppression(): void {
    this.suppressionDepth += 1;
    this.active = false;
  }

  popSuppression(now: number): void {
    this.suppressionDepth = Math.max(0, this.suppressionDepth - 1);
    if (this.suppressionDepth === 0) {
      // The clock restarts, so the work that just finished is not counted as
      // time the person spent away.
      this.lastActivity = now;
      this.active = false;
    }
  }

  get suppressed(): boolean {
    return this.suppressionDepth > 0;
  }
}
