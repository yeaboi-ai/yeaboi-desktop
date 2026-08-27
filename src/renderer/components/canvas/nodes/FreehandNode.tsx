'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';

interface FreehandNodeData {
  points: { x: number; y: number }[];
  color?: string;
  width?: number;
  [key: string]: unknown;
}

/** Converts an array of relative points to a smoothed SVG path string. */
function smoothPath(points: { x: number; y: number }[]): string {
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
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function FreehandNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FreehandNodeData;
  const points = nodeData.points || [];
  const color = nodeData.color || 'var(--muted-foreground)';
  const width = nodeData.width || 2;

  if (points.length === 0) return null;

  // Compute bounding box
  let maxX = 0;
  let maxY = 0;
  for (const pt of points) {
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const svgWidth = maxX + width;
  const svgHeight = maxY + width;

  return (
    <div
      style={{
        position: 'relative',
        width: svgWidth,
        height: svgHeight,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{
          overflow: 'visible',
          filter: selected ? 'drop-shadow(0 0 3px rgba(229,166,48,0.5))' : 'none',
          pointerEvents: 'none',
        }}
      >
        {/* Thick invisible stroke for easier grabbing */}
        <path
          d={smoothPath(points)}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(width * 6, 16)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'stroke', cursor: 'move' }}
          className="drag-handle__freehand"
        />
        {/* Visible stroke */}
        <path
          d={smoothPath(points)}
          fill="none"
          stroke={selected ? 'var(--primary)' : color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}

export const FreehandNode = memo(FreehandNodeComponent);
