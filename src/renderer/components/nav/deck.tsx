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
/** Where the surface sits while it is in transit: not pulled evenly in from the
 *  window, but tucked past the chrome that does not travel with it — the rail on
 *  the left, the traffic lights above, the dock row below. The right has nothing
 *  beside it, so it barely comes in at all. */
const PREVIEW_EDGES = { left: 56, top: 42, right: 56, bottom: 56 };
/** The transit easing: long and almost entirely decelerating, so the surface
 *  arrives rather than stops. */
/** How long to wait for a surface's heading to appear before giving up on
 *  decoding it. A page renders its backend gate first. */
const HEADING_WAIT_MS = 1200;

const PREVIEW_EASE = '620ms cubic-bezier(0.16, 1, 0.3, 1)';

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
  const [held, setHeld] = useState('none');
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
        const { left, top, right, bottom } = PREVIEW_EDGES;
        // Per-axis, because the four insets differ, with a translate to put the
        // shrunken surface where those insets say rather than in the middle.
        const sx = 1 - (left + right) / window.innerWidth;
        const sy = 1 - (top + bottom) / window.innerHeight;
        const tx = (left - right) / 2;
        const ty = (top - bottom) / 2;
        setHeld(`translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`);
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
      // Something is open over the deck and has the window: paging beneath it
      // moves a surface nobody is looking at.
      if (document.documentElement.dataset['overlay']) return;
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

  // The title and its line of description are the two things you read to find
  // out where you have landed, so they neither rise with the rest of the
  // surface nor travel with its pull-back — they simply stay where they are.
  // Driven from here because every page writes its own heading, and the deck is
  // what knows how much a surface is being held back.
  useEffect(() => {
    let frame = 0;
    let stop = () => {};

    const begin = (title: HTMLElement) => {
      const lines = [title, title.nextElementSibling, title.parentElement?.nextElementSibling]
        .filter((el): el is HTMLElement => el instanceof HTMLElement)
        .filter((el) => el === title || el.tagName === 'P')
        .filter((el) => el.textContent!.trim().length > 0)
        .map((el) => ({ el }));
      if (lines.length === 0) return () => {};

      // The heading is drawn outside the surface while the surface is held back.
      //
      // Counter-transforming it in place kept it still but scaled it down and
      // straight back up, so every glyph was resampled twice and it came out
      // soft and jittery. Nothing that is scaled can stay sharp: the way to
      // have it both still and crisp is for it not to be in the thing that
      // scales. So for the length of the transit it is copied into a layer of
      // its own, at the coordinates it holds at rest, and the original is
      // hidden underneath.
      const port = document.querySelector<HTMLElement>('[data-deck]');
      const matrix = () => new DOMMatrix(port ? getComputedStyle(port).transform : 'none');

      let anchors = lines.map(({ el }) => ({ el, left: 0, top: 0, width: 0 }));
      let layer: HTMLDivElement | null = null;
      let hold = 0;

      const drop = () => {
        layer?.remove();
        layer = null;
        for (const { el } of lines) el.style.visibility = '';
      };

      const raise = () => {
        if (layer) return;
        // A heading that first appears mid-transit has never been measured at
        // rest, and a copy placed from an unmeasured anchor lands at the corner
        // of the window in a column one word wide. Read it now instead, undoing
        // the transform the surface is currently under.
        if (anchors.some((a) => a.width === 0)) {
          const m = matrix();
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          anchors = lines.map(({ el }) => {
            const box = el.getBoundingClientRect();
            return {
              el,
              left: (box.left - m.e - cx) / m.a + cx,
              top: (box.top - m.f - cy) / m.d + cy,
              width: box.width / m.a,
            };
          });
        }
        if (anchors.some((a) => a.width === 0)) return;
        layer = document.createElement('div');
        layer.dataset['deckHeading'] = '';
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30';
        for (const { el, left, top, width } of anchors) {
          const copy = el.cloneNode(true) as HTMLElement;
          copy.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;margin:0`;
          layer.append(copy);
          el.style.visibility = 'hidden';
        }
        document.body.append(layer);
      };

      const steady = () => {
        const m = matrix();
        if (m.a === 1 && m.d === 1 && m.e === 0 && m.f === 0) {
          drop();
          // At rest is when its position is read: content loading underneath it
          // moves the line, and a stale anchor would place the copy wrongly.
          anchors = lines.map(({ el }) => {
            const box = el.getBoundingClientRect();
            return { el, left: box.left, top: box.top, width: box.width };
          });
        } else {
          raise();
        }
        hold = requestAnimationFrame(steady);
      };
      steady();

      return () => {
        cancelAnimationFrame(hold);
        drop();
      };
    };

    // The heading is not there the moment a route commits — a page renders its
    // backend gate first — so watch for it rather than looking once and giving
    // up. An observer rather than a polled frame: it fires before the browser
    // paints, so the heading is never drawn for a frame uncompensated, which
    // was worth 13px of jump on the surfaces that gate.
    const found = () => {
      const title = document.querySelector('.deck-page h1');
      if (!(title instanceof HTMLElement)) return false;
      stop = begin(title);
      return true;
    };

    let observer: MutationObserver | null = null;
    if (!found()) {
      observer = new MutationObserver(() => {
        if (found()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Nothing arrived: stop watching rather than observing the document for
      // the life of the surface.
      frame = window.setTimeout(() => observer?.disconnect(), HEADING_WAIT_MS);
    }

    return () => {
      clearTimeout(frame);
      observer?.disconnect();
      stop();
    };
  }, [pathname, reduced]);

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
        // It shrinks in transit rather than being clipped to size: the pull-back
        // is the whole cue that the surface is in hand and not yet yours. Text
        // is resampled while it is scaled, so it is a little soft for as long as
        // the surface is held — the price of the movement.
        transform: preview ? held : 'translate(0px, 0px) scale(1, 1)',
        transformOrigin: 'center center',
        // The window's own radius, so the corner in transit runs parallel to the
        // one around it rather than being a second, differently curved one.
        borderRadius: preview ? 'var(--window-radius)' : '0px',
        overflow: preview ? 'hidden' : undefined,
        transition: reduced
          ? undefined
          : `transform ${PREVIEW_EASE}, border-radius ${PREVIEW_EASE}`,
        willChange: 'transform',
        // Inert while held back: a half-dealt card should not take a click
        // meant for the one underneath it.
        pointerEvents: preview ? 'none' : undefined,
        // Nothing about the surface changes colour or size in transit. Fading
        // it let the background through and the card read as a lighter patch
        // than the window; scaling it made the text soft. Only its edges move.
      }}
    >
      {/* Keyed on the route so the surface remounts and its contents deal
          themselves in again on every turn. */}
      {/* The rail overlays the left edge, so the page is inset by the rail
          plus the same gutter it gets on the right — otherwise the content
          runs to within a fraction of the right edge of the window. */}
      <div key={pathname} className="deck-page pl-[72px] pr-6 pt-[var(--titlebar-h)]">
        {children}
      </div>
    </div>
  );
}
