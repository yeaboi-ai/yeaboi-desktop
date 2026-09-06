// Clicking the row you are already on.
//
// The nav has nowhere to take you, so the surface takes it as "put back what
// you opened over me" — the month calendar closes to its week, and anything
// else that grew over its page can do the same.

const NAV_AGAIN = 'nav:again';

export function navAgain(): void {
  window.dispatchEvent(new Event(NAV_AGAIN));
}

export function onNavAgain(run: () => void): () => void {
  window.addEventListener(NAV_AGAIN, run);
  return () => window.removeEventListener(NAV_AGAIN, run);
}
