// "Show me what that looks like."
//
// The settings page cannot reach into the host — the saver is mounted once in
// Providers, far above it — so the Preview button asks rather than renders. A
// one-line bus, in preference to threading a callback through the settings tree
// for a button that fires once in a while.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Ask the mounted saver to take the window over now. */
export function previewScreensaver(): void {
  for (const listener of listeners) listener();
}

export function onPreviewRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
