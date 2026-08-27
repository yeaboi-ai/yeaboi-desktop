"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { type DrawPoint, type DrawStroke, STROKE_TTL_MS } from "@/hooks/use-screen-draw";

interface ScreenDrawCanvasProps {
  /** When true, capture pointer input and let the user draw. Otherwise the
   *  canvas is click-through and only renders existing (e.g. remote) strokes. */
  active: boolean;
  strokes: DrawStroke[];
  onStroke: (points: DrawPoint[]) => void;
  pruneExpired: () => void;
}

const INK = "rgb(255, 64, 64)";
const INK_GLOW = "rgba(255, 64, 64, 0.55)";

/**
 * Transparent canvas overlay for the shared-screen tile. In `active` mode the
 * user draws ephemeral pen strokes (Slack-huddle style) that fade after
 * STROKE_TTL_MS; strokes are reported via `onStroke` (broadcast + sent to the
 * AI by the hook). Renders both local and remote strokes with an age-based
 * fade in a requestAnimationFrame loop.
 */
export function ScreenDrawCanvas({ active, strokes, onStroke, pruneExpired }: ScreenDrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRef = useRef<DrawPoint[]>([]);
  const drawingRef = useRef(false);
  const strokesRef = useRef<DrawStroke[]>(strokes);
  // Mirror the latest strokes into a ref so the rAF loop reads current data
  // without re-subscribing each render (refs must not be written in render).
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // Keep the backing store sized to the element for crisp lines.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Render loop: paint all strokes with age fade + the in-progress stroke.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const { width: w, height: h } = canvas;
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const now = Date.now();
        const paint = (pts: DrawPoint[], alpha: number) => {
          if (pts.length === 0 || alpha <= 0) return;
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.strokeStyle = INK;
          ctx.shadowColor = INK_GLOW;
          ctx.shadowBlur = Math.max(4, w * 0.006);
          ctx.lineWidth = Math.max(3, w * 0.005);
          if (pts.length === 1) {
            const x = pts[0].x * w;
            const y = pts[0].y * h;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(6, w * 0.01), 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(pts[0].x * w, pts[0].y * h);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
            ctx.stroke();
          }
        };
        for (const s of strokesRef.current) paint(s.points, 1 - (now - s.ts) / STROKE_TTL_MS);
        if (drawingRef.current) paint(currentRef.current, 1);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      pruneExpired();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pruneExpired]);

  const toNorm = useCallback((e: ReactPointerEvent<HTMLCanvasElement>): DrawPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      const p = toNorm(e);
      if (!p) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      currentRef.current = [p];
    },
    [active, toNorm],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active || !drawingRef.current) return;
      const p = toNorm(e);
      if (p) currentRef.current.push(p);
    },
    [active, toNorm],
  );

  const endStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentRef.current;
    currentRef.current = [];
    if (pts.length > 0) onStroke(pts);
  }, [onStroke]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="screen-draw-canvas"
      className={`absolute inset-0 z-10 h-full w-full ${active ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
    />
  );
}
