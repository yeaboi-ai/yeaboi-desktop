'use client';

// A scrollbar the app draws: a short track down the right edge, mirroring the
// rail on the left, with a thumb that says where in the page you are — and can
// be dragged, since it is the one part of the chrome that knows where the rest
// of the page is.
//
// It lives in the chrome rather than on the page, and finds whatever the page
// has marked `data-scrollport`. That is what lets it slide out when a page that
// scrolls is left, and stay put while you move between pages that all scroll:
// mounted on the page it would come and go with each one, and an object that
// leaves by vanishing reads as a bug rather than an exit.

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** How long after the last scroll the rail settles back to its resting weight. */
const SETTLE_MS = 700;
/** The room the thumb keeps off each end of the track. */
const PAD = 3;
/** How much a page has to have below the fold before it is worth a rail. */
const ENOUGH = 40;
/** A thumb short enough to travel: it says where you are, and a long one says
 *  it by barely moving. */
const MIN_THUMB = 16;
const MAX_THUMB_SHARE = 0.18;
/** The track's width. Fixed: it is the groove, and a groove that breathes is
 *  a second animation for the one thing the thumb already says. */
const TRACK_W = 10;
/** Where it waits: off the window's right edge, so it arrives and leaves by
 *  sliding rather than by fading. */
const OFFSCREEN = 40;

/** The port a page has marked as the thing that scrolls, if it has one. */
function findPort(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-scrollport]');
}

export function ScrollRail({ className }: { className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [port, setPort] = useState<HTMLElement | null>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pages come and go under the chrome; the rail follows whichever one is
  // scrolling now rather than being told.
  useEffect(() => {
    const look = () => setPort((current) => (current?.isConnected ? current : findPort()));
    look();
    const watch = new MutationObserver(look);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);

  const measure = useCallback(() => {
    const rail = track.current;
    if (!port || !rail) {
      setThumb(null);
      return;
    }
    // The clearance a page keeps under itself for the dock is scrollable room
    // that holds nothing. It is not travel the rail should describe: measured
    // with it, the thumb bottoms out in empty space and a page with a line or
    // two too many gets a rail it does not need.
    const column = port.firstElementChild;
    const clearance = column ? parseFloat(getComputedStyle(column).paddingBottom) || 0 : 0;
    const room = Math.max(0, port.scrollHeight - port.clientHeight - clearance);
    // Nothing much to scroll is nothing to say: the rail leaves rather than
    // sitting there full-length pretending to be a control.
    if (room < ENOUGH) {
      setThumb(null);
      return;
    }
    const inner = rail.clientHeight - PAD * 2;
    const height = Math.min(
      Math.max(MIN_THUMB, (port.clientHeight / (port.clientHeight + room)) * inner),
      inner * MAX_THUMB_SHARE,
    );
    setThumb({ top: PAD + (Math.min(port.scrollTop, room) / room) * (inner - height), height });
  }, [port]);

  useEffect(() => {
    if (!port) {
      setThumb(null);
      return;
    }
    measure();

    const onScroll = () => {
      measure();
      setMoving(true);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => setMoving(false), SETTLE_MS);
    };
    port.addEventListener('scroll', onScroll, { passive: true });

    // The page grows and shrinks under it — a card opening, a filter narrowing
    // a list — and a thumb sized once is wrong from the first of those.
    const watch = new ResizeObserver(measure);
    watch.observe(port);
    if (port.firstElementChild) watch.observe(port.firstElementChild);

    return () => {
      port.removeEventListener('scroll', onScroll);
      watch.disconnect();
      if (settle.current) clearTimeout(settle.current);
    };
  }, [port, measure]);

  // Dragging. The grab point is kept, so the thumb does not jump to the pointer
  // on the first move — you are holding the place you took hold of.
  const grab = useRef<{ y: number; top: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!thumb || !port) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    grab.current = { y: event.clientY, top: port.scrollTop };
    setDragging(true);
    setMoving(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const rail = track.current;
    const start = grab.current;
    if (!start || !port || !rail || !thumb) return;
    const column = port.firstElementChild;
    const clearance = column ? parseFloat(getComputedStyle(column).paddingBottom) || 0 : 0;
    const room = Math.max(0, port.scrollHeight - port.clientHeight - clearance);
    const travel = rail.clientHeight - PAD * 2 - thumb.height;
    if (travel <= 0) return;
    port.scrollTop = Math.max(
      0,
      Math.min(room, start.top + ((event.clientY - start.y) / travel) * room),
    );
  };

  const release = (event: React.PointerEvent) => {
    if (!grab.current) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    grab.current = null;
    setDragging(false);
  };

  const shown = Boolean(thumb);
  const held = hovered || dragging;
  const wide = moving || held;
  // Under the hand it breaks out of its own track: a thumb inside a groove is
  // a readout, and one standing proud of it is something to take hold of.
  const thumbWidth = held ? TRACK_W + 6 : moving ? 5 : 3;

  return (
    <div
      ref={track}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        'fixed top-1/2 right-3 z-20 h-[min(18rem,45%)] rounded-full bg-card ring-1 ring-border/60',
        'transition-transform duration-300 ease-out',
        shown ? 'pointer-events-auto cursor-grab' : 'pointer-events-none',
        dragging && 'cursor-grabbing',
        className,
      )}
      style={{
        width: TRACK_W,
        // On and off the page as a page that scrolls comes and goes.
        transform: `translate(${shown ? 0 : OFFSCREEN}px, -50%)`,
      }}
    >
      {thumb && (
        <div
          className={cn(
            // No transition on its position: the thumb is the scroll, and a
            // thumb easing into place arrives after the page has stopped.
            // Centred by transform rather than by a margin: a margin that has
            // to be recomputed with the width grows it out of one side.
            'pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-foreground/30',
            'transition-[width,background-color] duration-150 ease-out',
            wide && 'bg-foreground/45',
          )}
          style={{
            top: thumb.top,
            height: thumb.height,
            width: thumbWidth,
          }}
        />
      )}
    </div>
  );
}
