'use client';

// The one embed frame in the window, mounted beside the other root hosts so a
// route change never unmounts it. It floats over the Music page's slot while
// that slot is on screen and clips to nothing otherwise; the sound carries on
// either way, and the rail pocket says so.
//
// The wrapper is one element whose style changes and nothing else: moving or
// re-keying an iframe reloads it, which is the bug this host exists to fix.

import { useEffect, useState } from 'react';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { EmbedFrame } from '@/components/music/embed-frame';
import { HIDDEN_FRAME, frameStyle, sameFrame, type FrameStyle } from '@/lib/music/embed/dock';

/** Under the sidebar (40) and every popover, drawer and the screensaver. */
const HOST_Z_INDEX = 20;

/** The slot's ancestors, so a sidebar that widens or a column that reflows
 *  without resizing the slot itself still moves the frame. */
function ancestorsOf(element: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    chain.push(node);
    node = node.parentElement;
  }
  return chain;
}

export function EmbedHost() {
  const { embed, embedFrame, embedSlot } = useMusicPlayer();
  const [style, setStyle] = useState<FrameStyle>(HIDDEN_FRAME);

  useEffect(() => {
    if (!embed) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = frameStyle(
        embedSlot?.getBoundingClientRect() ?? null,
        embedSlot ? 'slot' : 'hidden',
      );
      setStyle((current) => (sameFrame(current, next) ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    if (embedSlot) for (const node of ancestorsOf(embedSlot)) observer.observe(node);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [embed, embedSlot]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __yeaboiEmbed?: unknown }).__yeaboiEmbed = { ...style, embed };
    }
  }, [style, embed]);

  if (!embed) return null;
  return (
    <div
      data-embed-host
      style={{
        position: 'fixed',
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        zIndex: HOST_Z_INDEX,
        overflow: 'hidden',
        borderRadius: 12,
        visibility: style.visible ? 'visible' : 'hidden',
        pointerEvents: style.visible ? 'auto' : 'none',
      }}
    >
      <EmbedFrame
        ref={embedFrame.ref}
        link={embed}
        src={embedFrame.src}
        onLoad={embedFrame.onLoad}
      />
    </div>
  );
}
