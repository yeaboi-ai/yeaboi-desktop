'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';

export type CanvasMode = 'select' | 'boxSelect' | 'lasso' | 'draw' | 'line' | 'laser' | 'sticky' | 'eraser';

interface Point {
  x: number;
  y: number;
}

interface FreehandPath {
  id: string;
  points: Point[];
  color: string;
  width: number;
}

interface LaserPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface FreehandLayerProps {
  mode: CanvasMode;
  strokeColor?: string;
  strokeWidth?: number;
  onFreehandComplete?: (pathData: string, points: Point[]) => void;
  onLineComplete?: (start: Point, end: Point) => void;
  onLassoComplete?: (flowPoints: Point[]) => void;
  onBoxSelectComplete?: (topLeft: Point, bottomRight: Point) => void;
  clearSignal?: number; // increment to clear all drawings
}

/** Convert an array of points into a smoothed SVG path using quadratic bezier curves. */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }

  // Final segment to last point
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;

  return d;
}

const LASER_LIFETIME_MS = 1500;

export default function FreehandLayer({
  mode,
  strokeColor = 'var(--muted-foreground)',
  strokeWidth = 2,
  onFreehandComplete,
  onLineComplete,
  onLassoComplete,
  onBoxSelectComplete,
  clearSignal = 0,
}: FreehandLayerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  const svgRef = useRef<SVGSVGElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [completedPaths, setCompletedPaths] = useState<FreehandPath[]>([]);

  // Line state
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [linePreview, setLinePreview] = useState<Point | null>(null);

  // Laser state
  const [laserPoints, setLaserPoints] = useState<LaserPoint[]>([]);
  const [laserNow, setLaserNow] = useState(0);
  const laserAnimRef = useRef<number>(0);
  const [laserCursor, setLaserCursor] = useState<Point | null>(null);

  // Track previous mode to detect changes and reset state
  const prevModeRef = useRef(mode);
  const modeChanged = prevModeRef.current !== mode;
  if (modeChanged) {
    prevModeRef.current = mode;
  }

  // Derive reset states from mode changes rather than using effects
  const drawingState = useMemo(() => {
    // When mode changes, we want to reset drawing/line state
    // The mode dependency ensures we get fresh values on mode change
    return { isDrawing: false, lineStart: null as Point | null, linePreview: null as Point | null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Apply resets when mode changes — use refs to avoid the effect lint rule
  const resetNeededRef = useRef(false);
  if (modeChanged) {
    resetNeededRef.current = true;
  }

  // Clear all drawings when signal changes
  useEffect(() => {
    if (clearSignal > 0) {
      setCompletedPaths([]);
      setCurrentPoints([]);
      setLineStart(null);
      setLinePreview(null);
      setLaserPoints([]);
    }
  }, [clearSignal]);

  // Animate laser decay — only subscribe/unsubscribe to rAF
  useEffect(() => {
    if (mode !== 'laser') {
      return;
    }

    const animate = () => {
      const now = Date.now();
      setLaserNow(now);
      setLaserPoints((prev) => prev.filter((p) => now - p.timestamp < LASER_LIFETIME_MS));
      laserAnimRef.current = requestAnimationFrame(animate);
    };
    laserAnimRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(laserAnimRef.current);
  }, [mode]);

  // Return screen-relative coords (relative to the SVG element) for drawing.
  // Flow coord conversion happens only when creating the React Flow node.
  const toScreenCoords = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const x = e.clientX - (rect?.left ?? 0);
      const y = e.clientY - (rect?.top ?? 0);
      return { x, y };
    },
    [],
  );

  const screenToFlow = useCallback(
    (pt: Point): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const clientX = pt.x + (rect?.left ?? 0);
      const clientY = pt.y + (rect?.top ?? 0);
      const pos = screenToFlowPosition({ x: clientX, y: clientY }, { snapToGrid: false });
      return { x: pos.x, y: pos.y };
    },
    [screenToFlowPosition],
  );

  // --- DRAW handlers ---
  const handleDrawPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'draw') return;
      if (e.button !== 0) return;
      // Don't capture if clicking on toolbar area (top 60px)
      if (e.clientY < 60) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as SVGSVGElement).setPointerCapture(e.pointerId);
      const pt = toScreenCoords(e);
      setIsDrawing(true);
      setCurrentPoints([pt]);
    },
    [mode, toScreenCoords],
  );

  const handleDrawPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode === 'draw' && isDrawing) {
        const pt = toScreenCoords(e);
        setCurrentPoints((prev) => [...prev, pt]);
        return;
      }
      if (mode === 'laser') {
        const pt = toScreenCoords(e);
        setLaserCursor(pt);
        if (isDrawing) {
          setLaserPoints((prev) => [...prev, { x: pt.x, y: pt.y, timestamp: Date.now() }]);
        }
        return;
      }
      if (mode === 'line' && lineStart) {
        const pt = toScreenCoords(e);
        setLinePreview(pt);
      }
    },
    [mode, isDrawing, lineStart, toScreenCoords],
  );

  const handleDrawPointerUp = useCallback(() => {
    if (mode !== 'draw' || !isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.length > 1) {
      // Convert screen coords → flow coords for the React Flow node
      const flowPoints = currentPoints.map(screenToFlow);
      const pathD = smoothPath(flowPoints);
      if (onFreehandComplete) {
        onFreehandComplete(pathD, flowPoints);
      }
    }
    setCurrentPoints([]);
  }, [mode, isDrawing, currentPoints, strokeColor, strokeWidth, onFreehandComplete]);

  // --- LINE handlers ---
  const handleLineClick = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'line') return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = toScreenCoords(e);

      if (!lineStart) {
        setLineStart(pt);
        setLinePreview(pt);
      } else {
        // Convert screen → flow coords for React Flow node
        if (onLineComplete) {
          onLineComplete(screenToFlow(lineStart), screenToFlow(pt));
        }
        setLineStart(null);
        setLinePreview(null);
      }
    },
    [mode, lineStart, toScreenCoords, strokeColor, strokeWidth, onLineComplete],
  );

  // --- LASSO handlers ---
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [finishedLasso, setFinishedLasso] = useState<Point[]>([]);
  const [isLassoing, setIsLassoing] = useState(false);

  const handleLassoPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'lasso' || e.button !== 0) return;
      if (e.clientY < 60) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as SVGSVGElement).setPointerCapture(e.pointerId);
      const pt = toScreenCoords(e);
      setIsLassoing(true);
      setLassoPoints([pt]);
      setFinishedLasso([]);
    },
    [mode, toScreenCoords],
  );

  const handleLassoPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'lasso' || !isLassoing) return;
      const pt = toScreenCoords(e);
      setLassoPoints((prev) => [...prev, pt]);
    },
    [mode, isLassoing, toScreenCoords],
  );

  const handleLassoPointerUp = useCallback(() => {
    if (mode !== 'lasso' || !isLassoing) return;
    setIsLassoing(false);
    if (lassoPoints.length > 2) {
      setFinishedLasso(lassoPoints);
      if (onLassoComplete) {
        const flowPoly = lassoPoints.map(screenToFlow);
        onLassoComplete(flowPoly);
      }
    }
    setLassoPoints([]);
  }, [mode, isLassoing, lassoPoints, screenToFlow, onLassoComplete]);

  // Clear finished lasso on mode change
  useEffect(() => {
    if (mode !== 'lasso') setFinishedLasso([]);
  }, [mode]);

  // --- BOX SELECT handlers ---
  const [boxStart, setBoxStart] = useState<Point | null>(null);
  const [boxEnd, setBoxEnd] = useState<Point | null>(null);
  const [finishedBox, setFinishedBox] = useState<{ start: Point; end: Point } | null>(null);
  const [isBoxing, setIsBoxing] = useState(false);

  const handleBoxPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'boxSelect' || e.button !== 0) return;
      if (e.clientY < 60) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as SVGSVGElement).setPointerCapture(e.pointerId);
      const pt = toScreenCoords(e);
      setIsBoxing(true);
      setBoxStart(pt);
      setBoxEnd(pt);
      setFinishedBox(null);
    },
    [mode, toScreenCoords],
  );

  const handleBoxPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (mode !== 'boxSelect' || !isBoxing) return;
      setBoxEnd(toScreenCoords(e));
    },
    [mode, isBoxing, toScreenCoords],
  );

  const handleBoxPointerUp = useCallback(() => {
    if (mode !== 'boxSelect' || !isBoxing || !boxStart || !boxEnd) return;
    setIsBoxing(false);
    const minX = Math.min(boxStart.x, boxEnd.x);
    const minY = Math.min(boxStart.y, boxEnd.y);
    const maxX = Math.max(boxStart.x, boxEnd.x);
    const maxY = Math.max(boxStart.y, boxEnd.y);
    if (maxX - minX > 5 || maxY - minY > 5) {
      setFinishedBox({ start: { x: minX, y: minY }, end: { x: maxX, y: maxY } });
      if (onBoxSelectComplete) {
        onBoxSelectComplete(screenToFlow({ x: minX, y: minY }), screenToFlow({ x: maxX, y: maxY }));
      }
    }
    setBoxStart(null);
    setBoxEnd(null);
  }, [mode, isBoxing, boxStart, boxEnd, screenToFlow, onBoxSelectComplete]);

  // Clear finished box on mode change
  useEffect(() => {
    if (mode !== 'boxSelect') setFinishedBox(null);
  }, [mode]);

  // Combined pointer handlers
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // Reset state on first interaction after mode change
      if (resetNeededRef.current) {
        resetNeededRef.current = false;
        setIsDrawing(false);
        setCurrentPoints([]);
        setLineStart(null);
        setLinePreview(null);
        if (mode !== 'laser') {
          setLaserPoints([]);
          setLaserNow(0);
        }
      }

      if (mode === 'draw') handleDrawPointerDown(e);
      else if (mode === 'lasso') handleLassoPointerDown(e);
      else if (mode === 'boxSelect') handleBoxPointerDown(e);
      else if (mode === 'laser') {
        if (e.button !== 0) return;
        if (e.clientY < 60) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDrawing(true);
      }
      else if (mode === 'line') handleLineClick(e);
    },
    [mode, handleDrawPointerDown, handleLassoPointerDown, handleBoxPointerDown, handleLineClick],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // Reset state on first interaction after mode change
      if (resetNeededRef.current) {
        resetNeededRef.current = false;
        setIsDrawing(false);
        setCurrentPoints([]);
        setLineStart(null);
        setLinePreview(null);
        if (mode !== 'laser') {
          setLaserPoints([]);
          setLaserNow(0);
        }
      }

      if (mode === 'lasso') handleLassoPointerMove(e);
      else if (mode === 'boxSelect') handleBoxPointerMove(e);
      else handleDrawPointerMove(e);
    },
    [mode, handleDrawPointerMove, handleLassoPointerMove, handleBoxPointerMove],
  );

  const handlePointerUp = useCallback(() => {
    if (mode === 'draw') handleDrawPointerUp();
    else if (mode === 'lasso') handleLassoPointerUp();
    else if (mode === 'boxSelect') handleBoxPointerUp();
    else if (mode === 'laser') setIsDrawing(false);
  }, [mode, handleDrawPointerUp, handleLassoPointerUp, handleBoxPointerUp]);

  const isActive = mode === 'draw' || mode === 'laser' || mode === 'line' || mode === 'lasso' || mode === 'boxSelect';

  // No viewport transform needed — we draw in screen coords, convert to flow on complete

  // Use the derived state for rendering — when mode changes, these will be the reset values
  // until user interaction updates them
  const effectiveIsDrawing = modeChanged ? drawingState.isDrawing : isDrawing;
  const effectiveLineStart = modeChanged ? drawingState.lineStart : lineStart;
  const effectiveLinePreview = modeChanged ? drawingState.linePreview : linePreview;

  // Laser trail — single smooth path with fading opacity
  const laserTrailElement = (() => {
    if (laserPoints.length < 2 || laserNow === 0) return null;

    // Build a smooth SVG path from all visible points
    const pts = laserPoints.filter(p => laserNow - p.timestamp < LASER_LIFETIME_MS);
    if (pts.length < 2) return null;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;

    // Overall opacity based on newest point age
    const newestAge = laserNow - pts[pts.length - 1].timestamp;
    const trailOpacity = Math.max(0, 0.7 * (1 - newestAge / LASER_LIFETIME_MS));

    return (
      <>
        {/* Glow */}
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={trailOpacity * 0.3} />
        {/* Core line */}
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={trailOpacity} />
        {/* Cursor dot */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill="var(--primary)" opacity={0.8} />
      </>
    );
  })();

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 60,  // leave toolbar area clickable
        left: 0,
        width: '100%',
        height: 'calc(100% - 60px)',
        pointerEvents: isActive ? 'all' : 'none',
        zIndex: 10,
        cursor: mode === 'draw' || mode === 'lasso' || mode === 'boxSelect' || mode === 'line' ? 'crosshair' : mode === 'laser' ? 'none' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <g>
        {/* Active drawing path (completed paths live as React Flow nodes) */}
        {effectiveIsDrawing && currentPoints.length > 1 && (
          <path
            d={smoothPath(currentPoints)}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Line preview */}
        {mode === 'line' && effectiveLineStart && effectiveLinePreview && (
          <>
            <line
              x1={effectiveLineStart.x}
              y1={effectiveLineStart.y}
              x2={effectiveLinePreview.x}
              y2={effectiveLinePreview.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray="6 4"
            />
            {/* Start point indicator */}
            <circle cx={effectiveLineStart.x} cy={effectiveLineStart.y} r={4} fill={strokeColor} />
          </>
        )}

        {/* Laser trail + cursor */}
        {mode === 'laser' && laserTrailElement}
        {mode === 'laser' && laserCursor && !laserTrailElement && (
          <circle cx={laserCursor.x} cy={laserCursor.y} r={4} fill="var(--primary)" opacity={0.8} />
        )}

        {/* Box select — active rectangle */}
        {mode === 'boxSelect' && isBoxing && boxStart && boxEnd && (
          <rect
            x={Math.min(boxStart.x, boxEnd.x)}
            y={Math.min(boxStart.y, boxEnd.y)}
            width={Math.abs(boxEnd.x - boxStart.x)}
            height={Math.abs(boxEnd.y - boxStart.y)}
            fill="rgba(229,166,48,0.04)"
            stroke="rgba(229,166,48,0.35)"
            strokeWidth={1.5}
            rx={2}
            ry={2}
          />
        )}
        {/* Box select — finished rectangle */}
        {mode === 'boxSelect' && !isBoxing && finishedBox && (
          <rect
            x={finishedBox.start.x}
            y={finishedBox.start.y}
            width={finishedBox.end.x - finishedBox.start.x}
            height={finishedBox.end.y - finishedBox.start.y}
            fill="rgba(229,166,48,0.04)"
            stroke="rgba(229,166,48,0.35)"
            strokeWidth={1.5}
            rx={2}
            ry={2}
          />
        )}

        {/* Lasso — active drawing stroke */}
        {mode === 'lasso' && isLassoing && lassoPoints.length > 1 && (
          <path
            d={smoothPath(lassoPoints)}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Lasso — finished selection perimeter */}
        {mode === 'lasso' && !isLassoing && finishedLasso.length > 2 && (
          <path
            d={smoothPath(finishedLasso) + ' Z'}
            fill="rgba(229,166,48,0.04)"
            stroke="rgba(229,166,48,0.35)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  );
}
