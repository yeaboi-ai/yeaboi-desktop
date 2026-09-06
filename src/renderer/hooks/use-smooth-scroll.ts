'use client';

// A wheel that glides rather than steps.
//
// A mouse wheel arrives as a few big jumps a second, and the browser applies
// each one whole: the page teleports a notch at a time. A trackpad already
// streams at frame rate and is left alone — smoothing something continuous
// only adds lag, and inertia that keeps going after the fingers stop is a
// different feeling altogether, which is not what this is.
//
// The ramp is exponential rather than timed: every notch moves the target and
// the scroll chases it, so a second notch mid-glide extends the same movement
// instead of restarting it.

import { useEffect } from 'react';

/** Deltas smaller than this, in pixel mode, are a trackpad streaming. */
const NOTCH = 20;
/** How much of the remaining distance is covered each frame. */
const CHASE = 0.22;
/** Below this the glide is over — anything less is a sub-pixel crawl. */
const ARRIVED = 0.5;

export function useSmoothScroll(port: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const box = port.current;
    if (!box) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let target = box.scrollTop;
    let frame = 0;

    const step = () => {
      const gap = target - box.scrollTop;
      if (Math.abs(gap) < ARRIVED) {
        box.scrollTop = target;
        frame = 0;
        return;
      }
      box.scrollTop += gap * CHASE;
      frame = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom and the horizontal axis are somebody else's.
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= NOTCH;
      if (!notch) {
        // A trackpad moved it; the glide has no say until the next notch.
        target = box.scrollTop;
        return;
      }
      const room = box.scrollHeight - box.clientHeight;
      // A line-mode wheel reports lines, not pixels.
      const by = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const next = Math.max(0, Math.min(room, (frame ? target : box.scrollTop) + by));
      // At the end of the page the wheel belongs to whatever is behind this
      // box — the deck's own paging — so it is not swallowed.
      if (next === box.scrollTop) return;
      event.preventDefault();
      target = next;
      if (!frame) frame = requestAnimationFrame(step);
    };

    box.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      box.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(frame);
    };
  }, [port]);
}
