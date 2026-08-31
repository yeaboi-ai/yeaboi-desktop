// "Show me what that looks like", and "the preference moved".
//
// The settings page cannot reach into the host — the saver is mounted once in
// Providers, far above it — so it asks rather than renders. A two-signal bus,
// in preference to threading callbacks through the settings tree.
//
// Preview carries the style because the tile you clicked is the one you expect
// to see, and it may not have finished saving yet. The change signal carries
// nothing: the host re-reads /api/ambience, so the stored preference stays the
// single source of truth for the idle path.

type PreviewListener = (style?: string) => void;
type ChangeListener = () => void;

const previewListeners = new Set<PreviewListener>();
const changeListeners = new Set<ChangeListener>();

/** Ask the mounted saver to take the window over now, in `style` if given. */
export function previewScreensaver(style?: string): void {
  for (const listener of previewListeners) listener(style);
}

export function onPreviewRequest(listener: PreviewListener): () => void {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

/** The stored preference changed — whoever draws it should read it again. */
export function saverPreferenceChanged(): void {
  for (const listener of changeListeners) listener();
}

export function onSaverPreferenceChange(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
