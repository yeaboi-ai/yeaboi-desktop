// The catalogue sheet saved something: the Music page's source tabs read the
// services from /api/ambience, and this is how they learn to read again.

type Listener = () => void;

const listeners = new Set<Listener>();

export function catalogueChanged(): void {
  for (const listener of listeners) listener();
}

export function onCatalogueChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
