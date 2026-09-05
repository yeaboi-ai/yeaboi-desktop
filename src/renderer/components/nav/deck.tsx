'use client';

// The app as a deck of full-screen surfaces rather than a set of pages you
// pick from a menu.
//
// A surface scrolls its own content normally, and scrolling past the end of it
// pages to the next one — so a tall page reads continuously and running out of
// it carries straight on into what follows. The surface itself does not move on
// arrival; its contents deal themselves in (see `deck-rise`), and the heading
// stays put.
//
// The deck is the scroll port: `body` is clipped so the window can have rounded
// corners, so a surface has nowhere else to scroll.
//
// Paging is navigation, not a carousel: each surface is its own route, so the
// rail, the Cmd shortcuts, deep links and the back button all still agree
// about where you are.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAudience } from '@/components/providers/audience-provider';
import { railSections } from '@/lib/nav/sections';

/** How long after the last scroll input the window settles back. Long enough
 *  that the frame does not blink between two flicks of the same gesture. */
const SETTLE_MS = 1000;

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

/**
 * Whether the wheel belongs to something under the pointer rather than to the
 * deck.
 *
 * A box with its own scrollbar owns the wheel for as long as the pointer is
 * over it — including at its ends. Handing the deck the wheel the moment a list
 * reached its last row turned "read the rest of this list" into a page turn,
 * and the only way back was to notice which of the two had moved. Move off the
 * list and the deck has the wheel again.
 */
function ownsWheel(from: HTMLElement | null): boolean {
  for (let node = from; node && node !== document.body; node = node.parentElement) {
    // The port is the deck's own, whatever its overflow says.
    if (node.hasAttribute('data-deck')) return false;
    const overflow = getComputedStyle(node).overflowY;
    if (/auto|scroll|overlay/.test(overflow) && node.scrollHeight > node.clientHeight + 1) {
      return true;
    }
  }
  return false;
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

  const routes = useMemo(
    () => railSections(audience).flatMap((section) => section.items.map((item) => item.href)),
    [audience],
  );

  const travel = useRef(0);
  const lastWheel = useRef(0);
  const lockedUntil = useRef(0);

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
      return true;
    },
    [routes, pathname, router],
  );

  // While the deck is being turned the window draws its own edge and holds
  // everything off it. A property of the document rather than React state,
  // because every surface that has to move by it is somewhere else in the
  // tree.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turning = useCallback(() => {
    document.documentElement.dataset['turning'] = '';
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      delete document.documentElement.dataset['turning'];
      settle.current = null;
    }, SETTLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
      delete document.documentElement.dataset['turning'];
    },
    [],
  );

  // And nothing is clickable while it is moving: a control that slides out
  // from under the cursor mid-press is a click that lands somewhere else.
  //
  // Swallowed here rather than with `pointer-events: none`, which would take
  // the wheel's own hit testing with it — the deck decides whether a box under
  // the pointer owns the gesture by looking at what the event landed on, and a
  // page with no targets left hands every scroll straight to the deck.
  useEffect(() => {
    const swallow = (e: Event) => {
      if (!('turning' in document.documentElement.dataset)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const kinds = ['pointerdown', 'mousedown', 'click'] as const;
    for (const kind of kinds) window.addEventListener(kind, swallow, true);
    return () => {
      for (const kind of kinds) window.removeEventListener(kind, swallow, true);
    };
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // Something is open over the deck and has the window: paging beneath it
      // moves a surface nobody is looking at.
      if (document.documentElement.dataset['overlay']) return;
      const now = Date.now();
      // Every wheel event the deck could act on, including the ones a box with
      // its own scrollbar ends up owning: the window is being scrolled through
      // either way, and the frame is about the gesture rather than the turn.
      turning();
      const fresh = now - lastWheel.current > GESTURE_GAP_MS;
      lastWheel.current = now;
      if (fresh) travel.current = 0;
      if (now < lockedUntil.current) return;

      // A box with a scrollbar of its own owns the gesture while the pointer
      // is over it.
      if (ownsWheel(e.target as HTMLElement | null)) {
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
  }, [deal, turning]);

  // Tab pages the deck, Shift+Tab pages back — the keyboard equivalent of a
  // detent. It only takes the key where there is nothing to type into and no
  // dialog to tab around inside, so ordinary focus travel still works wherever
  // focus travel is what Tab means.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.documentElement.dataset['overlay']) return;
      const focused = document.activeElement as HTMLElement | null;
      if (focused && (isEditable(focused) || focused.closest('[role="dialog"], [role="menu"]')))
        return;
      if (!deal(e.shiftKey ? -1 : 1)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deal]);

  return (
    // The window itself never scrolls. A surface is exactly the port's height,
    // and anything with more to show than fits scrolls inside its own box —
    // a page that slides under the dock reads as one that was cut off, and a
    // scroll that moves the title is a page pretending to be a document.
    <div data-deck className="h-screen overflow-hidden">
      {/* The frame, growing in from the sides. Painted over everything and
          never in the way of anything: it is the window's own edge moving. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[100] rounded-[var(--window-radius)] border border-foreground/45 transition-[inset,opacity] duration-300 ease-out"
        style={{
          inset: 'var(--turn-inset)',
          opacity: 'var(--turn-frame-opacity, 0)',
        }}
      />
      {/* Keyed on the route so the surface remounts and its contents deal
          themselves in again on every turn. */}
      {/* The rail overlays the left edge, so the page is inset by the rail
          plus the same gutter it gets on the right — otherwise the content
          runs to within a fraction of the right edge of the window. The floor
          is the dock's: it floats over the page too, and a list that ends
          under it looks like a list that was cut off. */}
      <div
        key={pathname}
        className="deck-page flex h-screen flex-col pt-[calc(var(--titlebar-h)+var(--turn-inset))] pr-[calc(1.5rem+var(--turn-inset))] pb-[calc(var(--dock-clear)+var(--turn-inset))] pl-[calc(var(--rail-clear)+var(--turn-inset))] transition-[padding] duration-300 ease-out"
      >
        {children}
      </div>
    </div>
  );
}
