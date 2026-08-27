'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

function StepEdgeComponent({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  label, style, markerEnd, markerStart,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} markerStart={markerStart}
        style={{ strokeWidth: 1.5, stroke: 'var(--muted-foreground)', ...style }} />
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 8}px)`,
            pointerEvents: 'all', fontSize: 10, color: 'var(--muted-foreground)',
            background: 'rgba(10,10,10,0.9)', padding: '2px 6px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.06)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            whiteSpace: 'nowrap',
          }}>{label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const StepEdge = memo(StepEdgeComponent);
