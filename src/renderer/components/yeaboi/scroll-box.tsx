'use client';

import { useState } from 'react';

/** How far the fade at a scrolled edge reaches. */
const FADE = 28;

/**
 * A box that scrolls at a fixed height, fading whichever edge has more past it.
 *
 * The fade is a mask rather than a gradient laid over the rows: the page has no
 * ground of its own here, so an overlay would be a smear of one colour on
 * whatever happens to be behind it.
 */
export function ScrollBox({
  height,
  className,
  children,
}: {
  height: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [edge, setEdge] = useState({ top: false, bottom: false });

  const read = (el: HTMLElement | null) => {
    if (!el) return;
    setEdge((was) => {
      const top = el.scrollTop > 2;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      return was.top === top && was.bottom === bottom ? was : { top, bottom };
    });
  };

  const from = edge.top ? `transparent 0, #000 ${FADE}px` : '#000 0';
  const to = edge.bottom ? `#000 calc(100% - ${FADE}px), transparent 100%` : '#000 100%';
  const mask = `linear-gradient(to bottom, ${from}, ${to})`;

  return (
    <div
      ref={read}
      data-wheel
      onScroll={(event) => read(event.currentTarget)}
      style={{ height, maskImage: mask, WebkitMaskImage: mask }}
      className={`slim-scroll overflow-y-auto overscroll-contain pr-2 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
