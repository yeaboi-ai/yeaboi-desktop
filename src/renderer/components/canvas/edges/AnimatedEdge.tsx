'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

const animationKeyframes = `
@keyframes canvas-edge-flow {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
`;

// Inject the keyframes once
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = animationKeyframes;
  document.head.appendChild(style);
  injected = true;
}

function AnimatedEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  markerStart,
}: EdgeProps) {
  injectKeyframes();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      {/* Base path for interaction area */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          strokeWidth: 1.5,
          stroke: 'var(--muted-foreground)',
          ...style,
        }}
      />
      {/* Animated overlay */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={1.5}
        stroke="rgba(229,166,48,0.5)"
        strokeDasharray="8 16"
        style={{
          animation: 'canvas-edge-flow 1s linear infinite',
          pointerEvents: 'none',
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              background: 'rgba(10,10,10,0.9)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const AnimatedEdge = memo(AnimatedEdgeComponent);
