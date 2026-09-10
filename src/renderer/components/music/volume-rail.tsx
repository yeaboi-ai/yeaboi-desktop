'use client';

// The groove the volume sits in: the scroll rail's thumb, lying down. The
// whole track takes the pointer, so there is no 3px target to hit.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export function VolumeRail({
  percent,
  onChange,
  tall,
}: {
  percent: number;
  onChange: (next: number) => void;
  /** The page's version: the same groove, at the weight of the scroll rail
   *  rather than of a control on the dock's row. */
  tall?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const fromPointer = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    onChange(Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * 100));
  };

  return (
    <div
      ref={track}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        fromPointer(event.clientX);
      }}
      onPointerMove={(event) => dragging && fromPointer(event.clientX)}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const by = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
        if (!by) return;
        event.preventDefault();
        onChange(Math.min(100, Math.max(0, percent + by)));
      }}
      className={cn(
        'group/rail relative w-full rounded-full bg-secondary/70 ring-1 ring-border/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        tall ? 'h-[14px]' : 'h-[10px]',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rail-thumb transition-[height] duration-300 ease-out',
          tall ? 'w-4' : 'w-3',
          tall
            ? dragging
              ? 'h-6'
              : 'h-3.5 group-hover/rail:h-6'
            : dragging
              ? 'h-4'
              : 'h-2.5 group-hover/rail:h-4',
        )}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

/** The room the thumb keeps off each end of the track. */
const PAD = 3;
const THUMB_H = 26;
/** The track's width, matching the scroll rail's groove. */
const TRACK_W = 10;
/** Where it waits: off the window's right edge, so it arrives by sliding. */
const OFFSCREEN = 40;
/** How long after the last change it settles back to its resting weight. */
const SETTLE_MS = 700;

/**
 * The volume as a column down the right edge, where the scroll rail lives.
 *
 * The same groove, the same thumb and the same entrance — it slides in from
 * off the edge rather than fading — because on a screen that does not scroll
 * this is what is standing in that place.
 *
 * On `document.body`, like the scroll rail: the deck puts a transform on every
 * page it draws, and a transformed ancestor is what `fixed` resolves against —
 * so left where it is written it would sit on the page rather than the window.
 */
export function VolumeColumn({
  percent,
  onChange,
  children,
}: {
  percent: number;
  onChange: (next: number) => void;
  /** Sits under the track. The cog, on the Music page. */
  children?: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const level = useRef(percent);
  level.current = percent;

  useEffect(() => {
    const arrive = setTimeout(() => setShown(true), 60);
    return () => clearTimeout(arrive);
  }, []);

  const stir = useCallback(() => {
    setMoving(true);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setMoving(false), SETTLE_MS);
  }, []);

  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);

  const fromPointer = (clientY: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return;
    const reach = box.height - PAD * 2 - THUMB_H;
    if (reach <= 0) return;
    const top = Math.min(Math.max(0, clientY - box.top - PAD - THUMB_H / 2), reach);
    // Up is louder, which is the way every other column in the world runs.
    onChange(Math.round((1 - top / reach) * 100));
    stir();
  };

  // The wheel turns it, and the page behind stays where it is. Hand-attached:
  // React's `onWheel` is passive, and a passive listener cannot hold the page.
  useEffect(() => {
    const box = track.current;
    if (!box) return;
    const spin = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(100, Math.max(0, level.current - Math.sign(event.deltaY) * 4));
      if (next !== level.current) {
        onChange(next);
        stir();
      }
    };
    box.addEventListener('wheel', spin, { passive: false });
    return () => box.removeEventListener('wheel', spin);
  }, [onChange, stir]);

  const held = hovered || dragging;
  const width = held ? TRACK_W + 6 : moving ? 5 : 3;

  return createPortal(
    // Centred on the window by a full-height flex box rather than by `top: 50%`
    // and a transform: the slide-in needs the transform, and the two cannot
    // share it. The box takes no pointer events; what is in it does.
    <div
      className="pointer-events-none fixed inset-y-0 right-3 z-20 flex items-center transition-transform duration-300 ease-out"
      style={{ transform: `translateX(${shown ? 0 : OFFSCREEN}px)` }}
    >
      <div
        data-wheel
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="pointer-events-auto relative"
      >
        <span
          className={cn(
            'absolute bottom-full left-1/2 mb-2 -translate-x-1/2 font-mono text-[11px] text-muted-foreground transition-opacity duration-200',
            held || moving ? 'opacity-100' : 'opacity-0',
          )}
        >
          {percent}%
        </span>
        <div
          ref={track}
          role="slider"
          aria-label="Volume"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            fromPointer(event.clientY);
          }}
          onPointerMove={(event) => dragging && fromPointer(event.clientY)}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            setDragging(false);
          }}
          onKeyDown={(event) => {
            const by = event.key === 'ArrowUp' ? 5 : event.key === 'ArrowDown' ? -5 : 0;
            if (!by) return;
            event.preventDefault();
            onChange(Math.min(100, Math.max(0, percent + by)));
            stir();
          }}
          className={cn(
            'relative h-[min(18rem,45vh)] rounded-full bg-card ring-1 ring-border/60',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
            'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          )}
          style={{ width: TRACK_W }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-rail-thumb transition-[width] duration-150 ease-out"
            style={{
              top: `calc(${PAD}px + (100% - ${PAD * 2 + THUMB_H}px) * ${(100 - percent) / 100})`,
              height: THUMB_H,
              width,
            }}
          />
        </div>
        {children && (
          // Always there — it is the only way into the settings — but quiet
          // until the rail is being used.
          <div
            className={cn(
              'absolute top-full left-1/2 mt-3 -translate-x-1/2 transition-opacity duration-200',
              held || moving ? 'opacity-100' : 'opacity-50',
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
