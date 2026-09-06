// One motion with a reason: the words of an example row travel up into the
// composer line when chosen, so the eye sees where they went. A clone of the
// text is carried from the row's place to the field's; the real change
// happens when it lands. Reduced motion lands at once.

const GLIDE_MS = 260;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function glideText(from: HTMLElement, to: HTMLElement, done: () => void): void {
  if (
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    done();
    return;
  }
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const clone = document.createElement('span');
  clone.textContent = from.textContent;
  clone.setAttribute('aria-hidden', 'true');
  const type = getComputedStyle(from);
  const style = clone.style;
  style.position = 'fixed';
  style.left = `${start.left}px`;
  style.top = `${start.top}px`;
  style.width = `${start.width}px`;
  style.margin = '0';
  style.pointerEvents = 'none';
  style.zIndex = '50';
  style.fontFamily = type.fontFamily;
  style.fontSize = type.fontSize;
  style.fontStyle = type.fontStyle;
  style.lineHeight = type.lineHeight;
  style.color = type.color;
  style.transition = `transform ${GLIDE_MS}ms ${EASE}, opacity ${GLIDE_MS}ms ${EASE}`;
  style.willChange = 'transform, opacity';
  document.body.appendChild(clone);
  from.style.visibility = 'hidden';

  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    clone.remove();
    from.style.visibility = '';
    done();
  };
  clone.addEventListener('transitionend', land, { once: true });
  window.setTimeout(land, GLIDE_MS + 140);
  requestAnimationFrame(() => {
    clone.style.transform = `translate(${end.left - start.left}px, ${end.top - start.top}px) scale(0.85)`;
    clone.style.opacity = '0.2';
  });
}
