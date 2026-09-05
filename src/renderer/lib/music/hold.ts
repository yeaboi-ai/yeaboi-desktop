// "Something is listening — the radio should wait."
//
// The twin of lib/screensaver/suppression.ts, and of pause_for_voice() in the
// terminal's music.py. A refcount, because a call and a dictation can overlap
// and the first to end must not restart the radio under the second.

type Listener = (held: boolean) => void;

let depth = 0;
const listeners = new Set<Listener>();

function announce(): void {
  const held = depth > 0;
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
  return depth > 0;
}

export function onMusicHoldChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget every outstanding claim. */
export function resetMusicHold(): void {
  depth = 0;
  listeners.clear();
}
