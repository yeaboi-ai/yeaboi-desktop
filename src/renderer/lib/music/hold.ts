// "Something is listening — the radio should wait."
//
// The twin of lib/screensaver/suppression.ts, and of pause_for_voice() in the
// terminal's music.py. A refcount, because a call and a dictation can overlap
// and the first to end must not restart the radio under the second.

type Listener = (held: boolean) => void;

let depth = 0;
// The "Pause during calls" preference: off, a claim is remembered but the
// listeners hear nothing, so the radio and the embed keep playing.
let enabled = true;
const listeners = new Set<Listener>();

function announce(): void {
  const held = enabled && depth > 0;
  for (const listener of listeners) listener(held);
}

/** Claim a hold. Call the returned function exactly once to release it. */
export function holdMusic(): () => void {
  depth += 1;
  announce();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    announce();
  };
}

export function isMusicHeld(): boolean {
  return enabled && depth > 0;
}

/** Follow the preference. Flipping it mid-call pauses or resumes at once. */
export function setMusicHoldEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  announce();
}

export function onMusicHoldChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget every outstanding claim. */
export function resetMusicHold(): void {
  depth = 0;
  enabled = true;
  listeners.clear();
}
