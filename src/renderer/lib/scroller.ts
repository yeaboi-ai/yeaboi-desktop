// Which box a wheel belongs to.
//
// A box with a scrollbar of its own owns the wheel for as long as the pointer
// is over it — including at its ends. The deck's own port is never one of
// those, whatever its overflow says: it pages, it does not scroll.

export function scrollerUnder(from: Element | null): HTMLElement | null {
  for (let node = from; node && node !== document.body; node = node.parentElement) {
    if (node.hasAttribute('data-deck')) return null;
    const overflow = getComputedStyle(node).overflowY;
    if (/auto|scroll|overlay/.test(overflow) && node.scrollHeight > node.clientHeight + 1) {
      return node as HTMLElement;
    }
  }
  return null;
}
