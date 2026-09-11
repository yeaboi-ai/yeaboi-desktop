'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stable per-deployment key for persisting the user's preferred width. */
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  /** Maximum width as a fraction of viewport (0-1). Defaults to 0.6 (60vw). */
  maxFraction?: number;
  /** Extra elements rendered to the right of the close button in the header strip. */
  headerSlot?: React.ReactNode;
  /** `modal` (the default) dims the page behind a backdrop; `panel` sits
   *  beside the content with no backdrop, the way a room's drawer does. */
  variant?: 'modal' | 'panel';
  children: React.ReactNode;
  className?: string;
}

const DEFAULT_STORAGE_KEY = 'panel.width';
const DEFAULT_WIDTH = 720;
const DEFAULT_MIN = 480;

/**
 * Right-edge slide-out sheet with a draggable resize handle on its left edge.
 * Persists width to localStorage so the user's preference survives reloads.
 *
 * The drag handle uses pointer-capture so the resize tracks even when the cursor
 * leaves the handle's hit zone, which is the usual pain point with naive drag
 * implementations. Pointer events also avoid colliding with @dnd-kit's
 * PointerSensor on the underlying board because the handle stops propagation.
 */
export function ResizableSheet({
  open,
  onOpenChange,
  storageKey = DEFAULT_STORAGE_KEY,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN,
  maxFraction = 0.6,
  headerSlot,
  variant = 'modal',
  children,
  className,
}: Props) {
  // Hydrate from localStorage at initialiser time so we never re-render
  // with the wrong width — and so the React 19 set-state-in-effect lint stays
  // happy. SSR safety: useState's initialiser is fine on the server because we
  // guard window access; on the client it runs synchronously before paint.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw == null ? NaN : Number(raw);
      if (Number.isFinite(parsed) && parsed >= minWidth) return parsed;
    } catch {
      // quota / private mode
    }
    return defaultWidth;
  });
  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ startX: number; startW: number } | null>(null);

  const persist = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = { startX: e.clientX, startW: width };
    handleRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const dx = drag.startX - e.clientX; // dragging left grows the panel
    const max = Math.floor(window.innerWidth * maxFraction);
    const next = Math.min(max, Math.max(minWidth, drag.startW + dx));
    setWidth(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    handleRef.current?.releasePointerCapture(e.pointerId);
    draggingRef.current = null;
    persist(width);
  };

  // Keyboard resize for accessibility — arrow keys nudge by 24px, Home/End
  // jump to min / max.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const max = Math.floor(window.innerWidth * maxFraction);
    let next = width;
    if (e.key === 'ArrowLeft') next = Math.min(max, width + 24);
    else if (e.key === 'ArrowRight') next = Math.max(minWidth, width - 24);
    else if (e.key === 'Home') next = minWidth;
    else if (e.key === 'End') next = max;
    else return;
    e.preventDefault();
    setWidth(next);
    persist(next);
  };

  // Esc closes — but only when the focused element isn't an input/textarea so
  // it doesn't conflict with field-level dismiss behaviour.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  const panel = (
    <div
      className={[
        'relative h-full overflow-hidden bg-background border-l border-border shadow-xl flex flex-col',
        className ?? '',
      ].join(' ')}
      style={{ width: `${width}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle on the left edge. 8px hit zone, visual line shown on hover. */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="group absolute left-0 top-0 z-10 h-full w-2 -translate-x-1 cursor-col-resize select-none"
      >
        <div className="mx-auto h-full w-px bg-transparent group-hover:bg-primary/40 group-active:bg-primary transition-colors" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Sticky close strip — keeps Close + headerSlot reachable while content scrolls. */}
      <div className="flex items-center justify-end gap-1 border-b border-border px-2 py-1.5 shrink-0">
        {headerSlot}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Close panel"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );

  if (variant === 'panel') {
    return (
      <div className="h-full shrink-0" role="complementary">
        {panel}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex" aria-modal="true" role="dialog">
      {/* Backdrop — click to close. */}
      <div className="flex-1 bg-black/30 transition-opacity" onClick={() => onOpenChange(false)} />
      {panel}
    </div>
  );
}
