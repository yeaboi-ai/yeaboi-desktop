'use client';

// The groove the volume sits in: the scroll rail's thumb, lying down. The
// whole track takes the pointer, so there is no 3px target to hit.

import { useRef, useState } from 'react';

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
