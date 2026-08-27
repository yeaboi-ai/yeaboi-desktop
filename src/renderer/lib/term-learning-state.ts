"use client";

/**
 * Per-browser learning state for the in-chat glossary feature.
 *
 * Wave 3: tracks which terms the user has clicked + dismissed ("Got it") so
 * we can:
 *   1. Stop highlighting a term once they've seen it a few times — keeps the
 *      chat from getting noisier than necessary.
 *   2. Surface a level-up banner suggesting they switch from "non_technical"
 *      to "comfortable" once they've absorbed enough terms.
 *
 * Stored in localStorage (no DB migration in Wave 3). Per-browser is fine —
 * the data is a soft personalization signal, not security or accounting.
 */

const STORAGE_KEY = "planning-platform:term-learning-state:v1";

/** Number of dismissals after which a term stops being highlighted. */
export const DISMISS_THRESHOLD = 3;

/** Unique terms dismissed before we prompt the user to upgrade their level. */
export const LEVEL_UP_SUGGEST_AT = 20;

interface TermStats {
  count: number;
  last_seen_at: string;
}

interface LearningState {
  terms_seen: Record<string, TermStats>;
}

const EMPTY: LearningState = { terms_seen: {} };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read(): LearningState {
  if (!isBrowser()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.terms_seen) {
      return parsed as LearningState;
    }
  } catch {
    // Corrupted storage — fall back to empty. Don't surface to user.
  }
  return EMPTY;
}

function write(state: LearningState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or disabled storage — silently degrade. The feature still works,
    // it just won't remember dismissals across reloads.
  }
}

/** Record that the user pressed "Got it" on a glossary term. */
export function recordDismissal(slug: string): void {
  const state = read();
  const existing = state.terms_seen[slug];
  state.terms_seen[slug] = {
    count: (existing?.count ?? 0) + 1,
    last_seen_at: new Date().toISOString(),
  };
  write(state);
  // Notify in-page listeners (e.g. the level-up banner) without a full reload.
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent("term-learning-state:changed"));
  }
}

/** True if the term should still be highlighted for this user.
 *  False after DISMISS_THRESHOLD dismissals. */
export function shouldHighlight(slug: string): boolean {
  const state = read();
  const stats = state.terms_seen[slug];
  return !stats || stats.count < DISMISS_THRESHOLD;
}

/** How many unique terms the user has dismissed at least once. */
export function uniqueDismissedCount(): number {
  const state = read();
  return Object.keys(state.terms_seen).length;
}

/** Wipe state — handy for QA and the level-up banner's "no thanks" path. */
export function resetLearningState(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("term-learning-state:changed"));
}
