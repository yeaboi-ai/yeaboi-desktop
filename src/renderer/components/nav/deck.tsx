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
/** How far the surface pulls in from the window while it is in transit. An
 *  even margin on all four sides, which a uniform scale cannot give on a
 *  window that is not square — it would leave the sides further in than the
 *  top and bottom. */
const PREVIEW_INSET = 26;

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

/** Somewhere Tab means "next field", not "next page". */
function isEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
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
  const [shrink, setShrink] = useState<[number, number]>([1, 1]);
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
      // The deck is a loop: past the last surface is the first one again, and
      // scrolling up off the top lands on the last. A dead end at either end
      // reads as the scroll having broken rather than as an edge.
      const next = (here + step + routes.length) % routes.length;
      router.push(routes[next]!);
      if (!reduced) {
        setShrink([
          1 - (2 * PREVIEW_INSET) / window.innerWidth,
          1 - (2 * PREVIEW_INSET) / window.innerHeight,
        ]);
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

  // Tab pages the deck, Shift+Tab pages back — the keyboard equivalent of a
  // detent. It only takes the key where there is nothing to type into and no
  // dialog to tab around inside, so ordinary focus travel still works wherever
  // focus travel is what Tab means.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      const focused = document.activeElement as HTMLElement | null;
      if (focused && (isEditable(focused) || focused.closest('[role="dialog"], [role="menu"]')))
        return;
      if (!deal(e.shiftKey ? -1 : 1)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
      data-deck
      className="h-screen overflow-y-auto"
      style={{
        transform: preview ? `scale(${shrink[0]}, ${shrink[1]})` : 'scale(1, 1)',
        transformOrigin: 'center center',
        transition: reduced ? undefined : 'all 420ms cubic-bezier(0.22, 1, 0.36, 1)',
        // Inert while held back: a half-dealt card should not take a click
        // meant for the one underneath it.
        pointerEvents: preview ? 'none' : undefined,
        // The window's own radius, so the corner in transit runs parallel to
        // the one around it rather than being a second, differently curved one.
        borderRadius: preview ? 'var(--window-radius)' : '0px',
        overflow: preview ? 'hidden' : undefined,
        // In transit the surface recedes rather than being framed: it fades
        // back behind a soft halo. A drawn edge reads as a dialog.
        opacity: preview ? 0.55 : 1,
        boxShadow: preview
          ? '0 0 70px color-mix(in srgb, var(--foreground) 6%, transparent)'
          : 'none',
      }}
    >
      {/* Keyed on the route so the surface remounts and its contents deal
          themselves in again on every turn. */}
      <div key={pathname} className="deck-page pl-[72px] pt-[var(--titlebar-h)]">
        {children}
      </div>
    </div>
  );
}
