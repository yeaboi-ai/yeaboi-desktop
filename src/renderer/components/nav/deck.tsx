'use client';

// The app as a deck of full-screen surfaces rather than a set of pages you
// pick from a menu.
//
// A surface scrolls its own content normally, and scrolling past the end of it
// pages to the next one — so a tall page reads continuously and running out of
// it carries straight on into what follows. The arriving surface comes in
// shrunk and inert, which is what makes it read as a card being dealt rather
// than a page that has already loaded; it settles to full size and becomes
// interactive a moment later, or the instant you click it.
//
// The deck is the scroll port: `body` is clipped so the window can have rounded
// corners, so a surface has nowhere else to scroll.
//
// Paging is navigation, not a carousel: each surface is its own route, so the
// rail, the Cmd shortcuts, deep links and the back button all still agree
// about where you are.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAudience } from '@/components/providers/audience-provider';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { railSections } from '@/lib/nav/sections';

/** A wheel event arriving this long after the last one starts a new gesture.
 *  This, not the size of the delta, is what tells a wheel from a trackpad: a
 *  wheel's detents are isolated in time, a trackpad streams at frame rate. */
const GESTURE_GAP_MS = 60;
/** The smallest isolated delta that reads as a deliberate detent rather than
 *  the opening frame of a trackpad swipe, which starts at a pixel or two. */
const IMPULSE = 8;
/** Trackpad distance that counts as one page. Short enough to feel immediate,
 *  long enough that resting two fingers does not page. */
const SWIPE = 90;
/** The floor between page turns. Small — scrolling fast should whizz through
 *  the deck, not queue up behind a lock. It exists only so one physical
 *  detent, which browsers can report as several events, is one page. */
const LOCK_MS = 60;
/** How long after the *last* page turn the surface settles. Paging again
 *  restarts it, so a fast run through the deck stays held back until it
 *  stops. */
const SETTLE_MS = 900;
/** How far it shrinks. Enough to read as held back; not so far it becomes a
 *  thumbnail of itself. */
const PREVIEW_SCALE = 0.93;

/** Whether anything under the pointer can still scroll the way the wheel is
 *  pointing. Walks the real scroll ancestry rather than an opt-in attribute, so
 *  a surface does not have to declare itself to stay readable. */
function canScroll(from: HTMLElement | null, delta: number): boolean {
  const room = (el: Element) =>
    delta > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;

  for (let node = from; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (/auto|scroll|overlay/.test(overflow) && node.scrollHeight > node.clientHeight + 1) {
      if (room(node)) return true;
    }
  }
  const doc = document.scrollingElement;
  return Boolean(doc && doc.scrollHeight > doc.clientHeight + 1 && room(doc));
}

export function Deck({ children }: { children: React.ReactNode }) {
  const { audience } = useAudience();
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const routes = useMemo(
    () => railSections(audience).flatMap((section) => section.items.map((item) => item.href)),
    [audience],
  );

  const [preview, setPreview] = useState(false);
  const travel = useRef(0);
  const lastWheel = useRef(0);
  const lockedUntil = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setPreview(false);
  }, []);

  const deal = useCallback(
    (step: 1 | -1) => {
      const here = routes.findIndex(
        (route) => pathname === route || pathname?.startsWith(`${route}/`),
      );
      if (here === -1) return false;
      const next = here + step;
      if (next < 0 || next >= routes.length) return false;
      router.push(routes[next]!);
      if (!reduced) {
        setPreview(true);
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(settle, SETTLE_MS);
      }
      return true;
    },
    [routes, pathname, router, reduced, settle],
  );

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      const fresh = now - lastWheel.current > GESTURE_GAP_MS;
      lastWheel.current = now;
      if (fresh) travel.current = 0;
      if (now < lockedUntil.current) return;

      // Content that can still scroll in this direction owns the gesture, and
      // the deck only takes over once it runs out. Scrolling a long surface to
      // its end and straight on into the next one is one continuous motion.
      if (canScroll(e.target as HTMLElement | null, e.deltaY)) {
        travel.current = 0;
        return;
      }

      // An isolated event is one detent of a wheel, and one detent is one
      // page. A trackpad instead streams deltas at frame rate, so its events
      // are never isolated and have to add up to a swipe. Telling them apart
      // by size alone fails: a wheel bump can be smaller than a fast swipe's
      // frame.
      const impulse = fresh && (Math.abs(e.deltaY) >= IMPULSE || e.deltaMode !== 0);
      if (impulse) {
        if (deal(e.deltaY > 0 ? 1 : -1)) lockedUntil.current = now + LOCK_MS;
        return;
      }

      travel.current += e.deltaY;
      if (Math.abs(travel.current) < SWIPE) return;
      const step = travel.current > 0 ? 1 : -1;
      travel.current = 0;
      if (deal(step)) lockedUntil.current = now + LOCK_MS;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [deal]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  return (
    <div
      // Clicking a held-back surface takes it now rather than waiting.
      onPointerDownCapture={preview ? settle : undefined}
      className="h-screen overflow-y-auto"
      style={{
        transform: preview ? `scale(${PREVIEW_SCALE})` : 'scale(1)',
        transformOrigin: 'center center',
        transition: reduced ? undefined : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
        // Inert while held back: a half-dealt card should not take a click
        // meant for the one underneath it.
        pointerEvents: preview ? 'none' : undefined,
        borderRadius: preview ? 18 : 0,
        overflow: preview ? 'hidden' : undefined,
      }}
    >
      {children}
    </div>
  );
}
