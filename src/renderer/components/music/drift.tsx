'use client';

// A line that walks its own length when it does not fit, and rests at both
// ends. An ellipsis says there is more; this says what it is.

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export function Drift({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = outer?.firstElementChild;
    if (!outer || !inner) return;
    const take = () => setOver(Math.max(0, inner.scrollWidth - outer.clientWidth));
    take();
    const watch = new ResizeObserver(take);
    watch.observe(outer);
    watch.observe(inner);
    return () => watch.disconnect();
  }, [text]);

  return (
    <span ref={box} className={`block overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      <span
        className={`inline-block ${over > 0 ? 'music-drift' : ''}`}
        style={over > 0 ? ({ '--drift': `-${over}px` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  );
}
