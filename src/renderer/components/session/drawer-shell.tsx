"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, GripHorizontal, Maximize2, Minimize2 } from "lucide-react";

// Global z-index counter — each panel gets the next value when focused.
// Panels live in the 70–199 range. Top bar and action buttons use z-[200]+.
let _globalZ = 70;
export function bringToFront(): number {
  _globalZ = _globalZ >= 190 ? 71 : _globalZ + 1;
  return _globalZ;
}

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks the visible peek strip on the closed drawer. */
  onOpen?: () => void;
  side: "left" | "right";
  title: string;
  width?: string;
  widthPx?: number;
  defaultY?: number;
  headerExtra?: React.ReactNode;
  storageKey?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Render the collapsed pill — shown when closed */
  collapsedContent?: React.ReactNode;
  /** Explicit collapsed position (overrides auto-detection) */
  collapsedPosition?: { x: number; y: number };
  /** Hide the drawer entirely (display:none) while keeping it mounted —
      used when the canvas is in fullscreen so in-call WebSockets etc.
      survive without unmounting. */
  hidden?: boolean;
  children: React.ReactNode;
}

export function DrawerShell({
  open,
  onClose,
  onOpen,
  side,
  title,
  width = "w-[380px]",
  widthPx,
  defaultY,
  headerExtra,
  storageKey,
  triggerRef,
  collapsedContent,
  collapsedPosition,
  hidden,
  children,
}: DrawerShellProps) {
  if (typeof window === "undefined") return null;

  return (
    <MorphPanel
      open={open}
      side={side}
      title={title}
      width={width}
      widthPx={widthPx}
      defaultY={defaultY}
      onClose={onClose}
      onOpen={onOpen}
      headerExtra={headerExtra}
      storageKey={storageKey}
      triggerRef={triggerRef}
      collapsedContent={collapsedContent}
      collapsedPosition={collapsedPosition}
      hidden={hidden}
    >
      {children}
    </MorphPanel>
  );
}

function MorphPanel({
  open,
  side,
  title,
  width,
  widthPx,
  defaultY: defaultYProp,
  onClose,
  onOpen,
  headerExtra,
  storageKey,
  triggerRef,
  collapsedContent,
  collapsedPosition,
  hidden,
  children,
}: {
  open: boolean;
  side: "left" | "right";
  title: string;
  width: string;
  widthPx?: number;
  defaultY?: number;
  onClose: () => void;
  onOpen?: () => void;
  headerExtra?: React.ReactNode;
  storageKey?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  collapsedContent?: React.ReactNode;
  collapsedPosition?: { x: number; y: number };
  hidden?: boolean;
  children: React.ReactNode;
}) {
  const panelWidth = widthPx || parseInt(width.match(/\d+/)?.[0] || "380", 10);
  const defaultX = side === "left" ? 16 : (typeof window !== "undefined" ? window.innerWidth - panelWidth - 24 : 0);
  // Top floating pills (Exit/title on the left, participants/Complete on
  // the right) sit at top:16 with height 44 — bottom edge at y=60. Default
  // the drawer top to 76 so it never collides with those pills.
  const defaultY = defaultYProp ?? 76;

  const [pos, setPos] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`drawer-pos-${storageKey}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { x: defaultX, y: defaultY };
  });
  const [zIndex, setZIndex] = useState(() => bringToFront());
  const [settled, setSettled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [peekHover, setPeekHover] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((v) => !v);
  }, []);

  // Closing the drawer should also drop fullscreen, otherwise the next open
  // would inherit a stuck fullscreen state.
  useEffect(() => {
    if (!open && fullscreen) setFullscreen(false);
  }, [open, fullscreen]);

  // Escape exits fullscreen. Route through a ref so the effect's deps stay
  // tight and the callback stays current across renders.
  const toggleFullscreenRef = useRef(toggleFullscreen);
  useEffect(() => { toggleFullscreenRef.current = toggleFullscreen; }, [toggleFullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") toggleFullscreenRef.current(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  // Get the collapsed pill dimensions — either from trigger ref or sensible defaults
  const bottomY = typeof window !== "undefined" ? window.innerHeight - 60 : 700;
  const rightX = typeof window !== "undefined" ? window.innerWidth - 130 : 1000;
  const autoDefault = side === "left"
    ? { x: 56, y: bottomY, w: 100, h: 38 }
    : { x: rightX, y: bottomY, w: 120, h: 38 };
  const collapsedDefault = collapsedPosition
    ? { x: collapsedPosition.x, y: collapsedPosition.y, w: 120, h: 38 }
    : autoDefault;
  const [triggerDimsState, setTriggerDimsState] = useState(collapsedDefault);
  // Keep collapsed dims in sync — priority: triggerRef > collapsedPosition > auto
  useEffect(() => {
    if (triggerRef?.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setTriggerDimsState({ x: r.left, y: r.top, w: r.width, h: r.height });
    } else if (collapsedPosition) {
      setTriggerDimsState({ x: collapsedPosition.x, y: collapsedPosition.y, w: 120, h: 38 });
    }
  }, [open, triggerRef, collapsedPosition]);

  // Reset settled when closing; set after morph finishes when opening
  useEffect(() => {
    if (!open) { setSettled(false); return; }
    const id = setTimeout(() => setSettled(true), 360); // slightly after 0.35s transition
    return () => clearTimeout(id);
  }, [open]);

  // Panel dimensions — top edge always at pos.y (cleared from top pills).
  // Bottom edge differs by state:
  //   Open: extends almost to the bottom (only 16px clearance) so the
  //         drawer consumes the full available height downwards.
  //   Closed: stops 76px above the bottom so the minimized peek strip
  //         doesn't collide with the bottom dock pill.
  const expandedHeight = typeof window !== "undefined"
    ? window.innerHeight - pos.y - (open ? 16 : 76)
    : 600;
  const td = triggerDimsState;
  // Slide the panel in from its side, with a subtle vertical lift + scale
  // for movement. Closed: leave a 12px clickable peek of the panel sticking
  // into the viewport — just a blank tab edge, no content visible.
  // Open: at rest, full scale.
  const PEEK = 12;
  // On hover (closed only), nudge the peek strip 8px further out so the
  // user gets visual feedback that the tab is interactive.
  const HOVER_NUDGE = 8;
  const offX = panelWidth - PEEK - (peekHover && !open ? HOVER_NUDGE : 0);
  const closedTransform = side === "left"
    ? `translate3d(-${offX}px, 14px, 0) scale(0.985)`
    : `translate3d(${offX}px, 14px, 0) scale(0.985)`;
  const panelTransform = open ? "translate3d(0, 0, 0) scale(1)" : closedTransform;

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role='button']")) return;
    dragging.current = true;
    setIsDragging(true);
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - offset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offset.current.y));
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
    if (storageKey) {
      try { localStorage.setItem(`drawer-pos-${storageKey}`, JSON.stringify(pos)); } catch {}
    }
  };

  // When closed, clicking anywhere on the visible peek strip should re-open
  // the drawer. The whole panel is clickable in the closed state since
  // pointer-events stay enabled (so the peek edge is the toggle handle).
  // collapsedContent is no longer rendered as a separate trigger — the
  // parent owns the unified bottom dock. We keep it as an unused prop.
  const _ = collapsedContent;
  const content = (
    <>
      {/* Open-position panel — slides in from its side with a small Y lift +
          scale. When closed, a 12px peek of the panel sticks into the
          viewport; hovering nudges it 6px further in, clicking re-opens. */}
      <div
        ref={panelRef}
        className={`fixed flex flex-col bg-background/75 backdrop-blur-md border border-border/70 shadow-2xl overflow-hidden ${open ? "" : "drawer-peek-closed"}`}
        style={{
          display: hidden ? "none" : "flex",
          left: fullscreen ? 0 : pos.x,
          top: fullscreen ? 0 : pos.y,
          width: fullscreen ? "100vw" : panelWidth,
          height: fullscreen ? "100vh" : expandedHeight,
          borderRadius: fullscreen ? 0 : 16,
          zIndex: fullscreen ? 9999 : zIndex,
          transform: fullscreen ? "none" : panelTransform,
          transformOrigin: side === "left" ? "right center" : "left center",
          pointerEvents: "auto",
          // Pointer cursor when closed (peek strip is a click target);
          // default cursor when open (no whole-panel toggle behaviour).
          cursor: open ? "default" : "pointer",
          transition: isDragging
            ? "none"
            : "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), height 0.32s cubic-bezier(0.4, 0, 0.2, 1), width 0.32s cubic-bezier(0.4, 0, 0.2, 1), left 0.32s cubic-bezier(0.4, 0, 0.2, 1), top 0.32s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.2s ease",
          willChange: "transform",
        }}
        data-side={side}
        onPointerDown={() => setZIndex(bringToFront())}
        onMouseEnter={() => { if (!open) setPeekHover(true); }}
        onMouseLeave={() => setPeekHover(false)}
        onClick={(e) => {
          if (!open && onOpen && !e.defaultPrevented) onOpen();
        }}
      >
        {/* Inner contents — only rendered visibly when open. When closed
            the peek strip on the side stays as a blank tab (panel bg
            + border only, zero contents bleeding through). */}
        <div
          className="flex flex-col h-full"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transition: "opacity 0.18s ease",
          }}
        >
          {/* Draggable header */}
          <div
            className={`flex items-center justify-between px-5 py-3 border-b border-border/70 shrink-0 select-none ${fullscreen ? "" : "cursor-grab active:cursor-grabbing"}`}
            onPointerDown={fullscreen ? undefined : handlePointerDown}
            onPointerMove={fullscreen ? undefined : handlePointerMove}
            onPointerUp={fullscreen ? undefined : handlePointerUp}
          >
            <div className="flex items-center gap-2">
              {!fullscreen && <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />}
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {title}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {headerExtra}
              <button
                onClick={toggleFullscreen}
                className="p-1 rounded-lg text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] transition-colors"
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {fullscreen ? (
                  <Minimize2 className="h-4 w-4 pointer-events-none" />
                ) : (
                  <Maximize2 className="h-4 w-4 pointer-events-none" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 pointer-events-none" />
              </button>
            </div>
          </div>

          {/* Content — only allow scrolling once the slide has settled */}
          <div className={`flex-1 flex flex-col ${settled ? "overflow-y-auto" : "overflow-hidden"}`}>
            {children}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
