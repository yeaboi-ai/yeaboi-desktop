'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

interface RelationshipEdgeData {
  cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
  [key: string]: unknown;
}

function RelationshipEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  style,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const edgeData = data as RelationshipEdgeData | undefined;
  const cardinality = edgeData?.cardinality || 'one-to-many';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Determine marker based on cardinality
  const cardinalityLabel = {
    'one-to-one': '1:1',
    'one-to-many': '1:N',
    'many-to-many': 'N:N',
  }[cardinality];

  return (
    <>
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
      <EdgeLabelRenderer>
        {/* Cardinality indicator */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'rgba(229,166,48,0.7)',
              background: 'rgba(10,10,10,0.9)',
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid rgba(229,166,48,0.15)',
              fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {cardinalityLabel}
          </div>
          {label && (
            <div
              style={{
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
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
