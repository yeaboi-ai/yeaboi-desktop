'use client';

// A wheel that glides rather than steps, in whatever box the pointer is over.
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
//
// One listener on the window rather than a hook per scroller: every list,
// sheet and panel in the app scrolls the same way, including the ones that
// only exist while they are open.

import { useEffect } from 'react';

import { scrollerUnder } from '@/lib/scroller';

/** Deltas smaller than this, in pixel mode, are a trackpad or a high-resolution
 *  mouse streaming rather than a wheel's detent. */
const NOTCH = 20;
/** How much of the remaining distance a frame covers. A detent is a jump worth
 *  easing over; a stream is already smooth and only wants its steps rounded
 *  off, so it is chased hard enough that nothing lags behind the fingers. */
const CHASE_NOTCH = 0.22;
const CHASE_STREAM = 0.5;
/** Below this the glide is over — anything less is a sub-pixel crawl. */
const ARRIVED = 0.5;
/** Further than this from where the last frame left it, and the box has been
 *  scrolled by something other than the glide. */
const TAKEN = 2;

/** `at` is where the last frame left the box: anything else there is somebody
 *  else scrolling, and they outrank a glide already in the air. */
type Glide = { target: number; frame: number; at: number; chase: number };

export function useSmoothScroll(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const glides = new Map<HTMLElement, Glide>();

    const step = (box: HTMLElement) => {
      const glide = glides.get(box);
      if (!glide) return;
      if (!box.isConnected || Math.abs(box.scrollTop - glide.at) > TAKEN) {
        glides.delete(box);
        return;
      }
      const gap = glide.target - box.scrollTop;
      if (Math.abs(gap) < ARRIVED) {
        box.scrollTop = glide.target;
        glides.delete(box);
        return;
      }
      box.scrollTop += gap * glide.chase;
      glide.at = box.scrollTop;
      glide.frame = requestAnimationFrame(() => step(box));
    };

    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom and the horizontal axis are somebody else's.
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const box = scrollerUnder(event.target as Element | null);
      if (!box) return;
      const glide = glides.get(box);
      const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= NOTCH;
      const chase = notch ? CHASE_NOTCH : CHASE_STREAM;
      const room = box.scrollHeight - box.clientHeight;
      // A line-mode wheel reports lines, not pixels.
      const by = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const from = glide ? glide.target : box.scrollTop;
      const next = Math.max(0, Math.min(room, from + by));
      // At the end of the box the wheel belongs to whatever is behind it, so
      // it is not swallowed.
      if (next === box.scrollTop) return;
      event.preventDefault();
      if (glide) {
        glide.target = next;
        // A stream arriving mid-glide catches up rather than dragging the
        // detent's slower curve behind it.
        glide.chase = Math.max(glide.chase, chase);
        return;
      }
      const fresh: Glide = { target: next, frame: 0, at: box.scrollTop, chase };
      glides.set(box, fresh);
      fresh.frame = requestAnimationFrame(() => step(box));
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      for (const glide of glides.values()) cancelAnimationFrame(glide.frame);
      glides.clear();
    };
  }, []);
}
