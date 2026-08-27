'use client';

import { type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface SwimlaneNodeData {
  label: string;
  color?: string;
  [key: string]: unknown;
}

function SwimlaneNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as SwimlaneNodeData;
  const label = nodeData.label || 'Lane';
  const color = nodeData.color || 'color-mix(in srgb, var(--foreground) 8%, transparent)';

  return (
    <div
      style={{
        minWidth: 400,
        minHeight: 150,
        width: '100%',
        height: '100%',
        border: `1px solid ${selected ? 'var(--primary)' : color}`,
        borderRadius: 6,
        background: 'rgba(255,255,255,0.01)',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Swimlane header stripe */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          background: color,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--muted-foreground)',
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export const SwimlaneNode = memo(SwimlaneNodeComponent);
