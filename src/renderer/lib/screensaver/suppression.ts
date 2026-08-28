// "Something is happening — do not take the window over."
//
// The DOM twin of suppress_screensaver() in the terminal. A refcount rather
// than a flag, because two things can be running at once and the first to
// finish must not clear the second's claim.
//
// Everything long-running holds one: a streaming run, a live call, voice
// capture. Without it the saver treats a ten-minute run as ten minutes of
// idleness and covers the thing the person is watching, which is the difference
// between a screensaver and an interruption.

type Listener = (suppressed: boolean) => void;

let depth = 0;
const listeners = new Set<Listener>();

function announce(): void {
  const suppressed = depth > 0;
  for (const listener of listeners) listener(suppressed);
}

/** Claim suppression. Call the returned function exactly once to release it. */
export function suppressScreensaver(): () => void {
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

export function isSuppressed(): boolean {
  return depth > 0;
}

export function onSuppressionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget every outstanding claim. */
export function resetSuppression(): void {
  depth = 0;
  listeners.clear();
}
