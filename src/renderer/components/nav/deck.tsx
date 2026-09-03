'use client';

// The app as a deck of full-screen surfaces rather than a set of pages you
// pick from a menu.
//
// A scroll past the end of the current surface pages to the next one — one
// surface per gesture, never a continuous scroll. The arriving surface comes
// in shrunk and inert, which is what makes it read as a card being dealt
// rather than a page that has already loaded; it settles to full size and
// becomes interactive a moment later, or the instant you click it.
//
// Paging is navigation, not a carousel: each surface is its own route, so the
// rail, the Cmd shortcuts, deep links and the back button all still agree
// about where you are.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAudience } from '@/components/providers/audience-provider';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { railSections } from '@/lib/nav/sections';

/** Wheel distance that counts as one page. High enough that a flick of a
 *  trackpad does not deal three cards. */
const NOTCH = 260;
/** After a page turn, wheel input is ignored for this long — a trackpad keeps
 *  emitting for a while after the fingers stop, and every one of those events
 *  would be another page. */
const LOCK_MS = 620;
/** How long the arriving surface stays shrunk before it settles by itself. */
const SETTLE_MS = 1500;
/** How far it shrinks. Enough to read as held back; not so far it becomes a
 *  thumbnail of itself. */
const PREVIEW_SCALE = 0.93;

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
      if (now < lockedUntil.current) return;

      // A surface that can still scroll owns the gesture; the deck only takes
      // over at the end of it. Otherwise a long page could never be read.
      const target = e.target as HTMLElement | null;
      const scroller = target?.closest<HTMLElement>('[data-deck-scroll]');
      if (scroller) {
        const atTop = scroller.scrollTop <= 0;
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atTop)) {
          travel.current = 0;
          return;
        }
      }

      travel.current += e.deltaY;
      if (Math.abs(travel.current) < NOTCH) return;
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
      className="min-h-screen"
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
