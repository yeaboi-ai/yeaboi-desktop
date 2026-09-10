'use client';

// Arranging the dashboard: the press that opens it, and the two gestures it
// opens onto.
//
// Both gestures are `useCarry` from the boards' motion package — the same
// physics that moves a retro card. What differs is only what lies under the
// pointer: a slot in the flow for a move, a footprint in grid tracks for a
// resize.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useCarry, type Carry } from '@board/motion/useCarry';
import {
  MAX_SIZE,
  MIN_SIZE,
  WIDGET_GAP,
  WIDGET_ROW,
  type WidgetId,
  type WidgetSize,
} from '@shared/widgets';

/** How long a press rests on a widget before the dashboard opens for editing. */
export const HOLD_TO_ARRANGE_MS = 550;
/** How far it may stray in that time, in px. */
const HOLD_SLOP = 8;
/** How long a widget takes to come back up once the press has done its work,
 *  or been let go of. */
export const SETTLE_MS = 320;

/**
 * Press and hold any widget to start arranging.
 *
 * `holding` is the id under the finger while the press is ripening, so the
 * widget can show it coming rather than the mode arriving from nowhere.
 */
export function useHoldToArrange(onOpen: () => void, enabled = true) {
  const [holding, setHolding] = useState<WidgetId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opened = useRef(onOpen);
  opened.current = onOpen;

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    setHolding(null);
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (id: WidgetId, event: PointerEvent) => {
      if (!enabled || (event.button !== undefined && event.button !== 0)) return;
      // A press on a control inside the widget is that control's.
      const from = event.target;
      if (from instanceof Element && from.closest('button, a, input, textarea, select')) return;

      const originX = event.clientX;
      const originY = event.clientY;
      setHolding(id);

      const move = (e: PointerEvent): void => {
        if (Math.hypot(e.clientX - originX, e.clientY - originY) > HOLD_SLOP) teardown();
      };
      const end = (): void => teardown();

      function teardown(): void {
        clearTimeout(timer.current);
        setHolding(null);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
      }

      timer.current = setTimeout(() => {
        teardown();
        opened.current();
      }, HOLD_TO_ARRANGE_MS);

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    },
    [enabled],
  );

  return { holding, onPointerDown, cancel: stop };
}

/**
 * Where in the drawn order a widget released here would land.
 *
 * Read fresh each frame rather than measured once: the dashed placeholder is a
 * real grid item, so the flow genuinely reflows as it moves and a snapshot
 * would be describing a layout that is no longer on screen. Eight tiles is a
 * cheap read; a retro column of fifty cards is not, which is why the motion
 * lets the caller decide.
 */
function slotUnder(dragged: string, x: number, y: number): number {
  // Still over the box it is already going into: hold it there. Without this
  // the answer chatters — moving the placeholder reflows the widgets it
  // displaced, which moves the very edges the next frame measures against.
  const slot = document.querySelector<HTMLElement>('[data-drop-slot]');
  if (slot) {
    const box = slot.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return indexOf(slot);
  }

  let index = 0;
  for (const el of document.querySelectorAll<HTMLElement>('[data-widget-id]')) {
    if (el.dataset['widgetId'] === dragged) continue;
    const box = el.getBoundingClientRect();
    // Below the whole row this widget occupies, or past its middle within it.
    if (y > box.bottom) index += 1;
    else if (y >= box.top && x > box.left + box.width / 2) index += 1;
  }
  return index;
}

/** Where the placeholder sits, counted in widgets rather than grid children. */
function indexOf(slot: HTMLElement): number {
  let index = 0;
  for (const sibling of slot.parentElement?.children ?? []) {
    if (sibling === slot) break;
    if (sibling instanceof HTMLElement && sibling.dataset['widgetId']) index += 1;
  }
  return index;
}

/**
 * Moving a widget into a different slot.
 *
 * The dashed placeholder the dashboard draws at the pending index is the
 * landing target — it is already exactly where the widget is going.
 */
export function useWidgetMove(
  onMoved: (id: WidgetId, index: number) => void,
  enabled: boolean,
): Carry<number> {
  return useCarry<number, string>({
    itemSelector: '[data-widget-id]',
    survey: useCallback((id: string) => id, []),
    hitTest: useCallback((id: string, x: number, y: number) => slotUnder(id, x, y), []),
    sameTarget: useCallback((a: number, b: number) => a === b, []),
    landingAt: useCallback(() => {
      const slot = document.querySelector<HTMLElement>('[data-drop-slot]');
      if (!slot) return null;
      const box = slot.getBoundingClientRect();
      return { left: box.left, top: box.top };
    }, []),
    onDrop: useCallback((id: string, index: number) => onMoved(id as WidgetId, index), [onMoved]),
    enabled,
  });
}

/** The grid as the resize needs it: where the widget starts, and how wide a
 *  column is. Measured once, so the drag costs no layout. */
interface Frame {
  left: number;
  top: number;
  column: number;
  columns: number;
}

/**
 * Resizing a widget by its corner.
 *
 * A carry whose target is a footprint rather than a place, and whose carried
 * copy is nothing: the widget itself redraws at the pending size, which only
 * happens when the size actually changes — that is what `sameTarget` is for.
 */
export function useWidgetResize(
  onResized: (id: WidgetId, size: WidgetSize) => void,
  enabled: boolean,
): Carry<WidgetSize> {
  return useCarry<WidgetSize, Frame>({
    itemSelector: '[data-widget-id]',
    survey: useCallback((id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
      const grid = el?.closest<HTMLElement>('[data-widget-grid]');
      const box = el?.getBoundingClientRect();
      const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1;
      const width = grid?.getBoundingClientRect().width ?? 0;
      return {
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        columns: tracks,
        column: (width - WIDGET_GAP * (tracks - 1)) / Math.max(1, tracks) + WIDGET_GAP,
      };
    }, []),
    hitTest: useCallback((frame: Frame, x: number, y: number) => {
      const w = Math.round((x - frame.left + WIDGET_GAP) / frame.column);
      const h = Math.round((y - frame.top + WIDGET_GAP) / (WIDGET_ROW + WIDGET_GAP));
      return {
        w: Math.min(Math.min(MAX_SIZE.w, frame.columns), Math.max(MIN_SIZE.w, w)),
        h: Math.min(MAX_SIZE.h, Math.max(MIN_SIZE.h, h)),
      };
    }, []),
    sameTarget: useCallback((a: WidgetSize, b: WidgetSize) => a.w === b.w && a.h === b.h, []),
    onDrop: useCallback(
      (id: string, size: WidgetSize) => onResized(id as WidgetId, size),
      [onResized],
    ),
    enabled,
  });
}

/** How many columns the grid is drawing right now, so a width can be clamped
 *  to what the window can show. */
export function useGridColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(MAX_SIZE.w);
  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const read = () => setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

/** How long a widget takes to fade out when it is taken off. */
export const LEAVE_MS = 180;
/** And how long whatever moves into its place takes to get there. */
const SLIDE_MS = 260;
const SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Slide whatever moved into a new place, rather than letting it jump.
 *
 * A FLIP over the grid: every tile is measured after each layout, and one that
 * has moved since the last is walked back to where it was and let go. New
 * tiles fade up instead, since they have nowhere to come from.
 *
 * Animations rather than inline transitions: a `style.transition` left on the
 * tile would go on overriding the transition its own stylesheet declares, and
 * the press that opens this mode would stop animating.
 *
 * `key` is whatever change should be animated — the drawn order and the sizes.
 * Tiles are keyed by `data-tile`; the drop placeholder deliberately carries
 * none, because smoothing it would make the drop indicator lag the pointer.
 * Held still during a carry: the widget in the air is already following the
 * pointer, and the placeholder moving is the answer, not something to smooth.
 */
export function useGridFlip(
  ref: React.RefObject<HTMLElement | null>,
  key: string,
  still: boolean,
): void {
  const boxes = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const before = boxes.current;
    const after = new Map<string, DOMRect>();

    // Every tile in the grid, not only the widgets: the placeholders move
    // when a widget leaves too, and one that jumps while its neighbours slide
    // is worse than none of them sliding.
    for (const tile of grid.querySelectorAll<HTMLElement>('[data-tile]')) {
      const id = tile.dataset['tile'] as string;
      const box = tile.getBoundingClientRect();
      after.set(id, box);
      if (still) continue;

      if (typeof tile.animate !== 'function') continue;

      const was = before.get(id);
      if (!was) {
        if (before.size === 0) continue; // the first paint is not an arrival
        tile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out' });
        continue;
      }

      const dx = was.left - box.left;
      const dy = was.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: SLIDE_MS,
        easing: SLIDE_EASE,
      });
    }

    boxes.current = after;
  }, [key, ref, still]);
}
