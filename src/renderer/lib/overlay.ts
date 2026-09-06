// Something is open over the page.
//
// The deck pages on the wheel and on Tab, and the rail leaves on Escape —
// none of which should reach a page with a sheet or a dialog over it. The flag
// is a property of the document because the surfaces that read it are nowhere
// near the thing that opened.

let open = 0;

/** Raise the flag for the life of an overlay; call the result when it closes. */
export function markOverlay(name: string): () => void {
  open += 1;
  document.documentElement.dataset['overlay'] = name;
  return () => {
    open = Math.max(0, open - 1);
    if (open === 0) delete document.documentElement.dataset['overlay'];
  };
}
