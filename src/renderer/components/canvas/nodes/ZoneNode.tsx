'use client';

import { type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface ZoneNodeData {
  label: string;
  color?: string;
  borderStyle?: 'solid' | 'dashed';
  [key: string]: unknown;
}

function ZoneNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ZoneNodeData;
  const borderColor = nodeData.color || 'var(--muted-foreground)';
  const borderStyle = nodeData.borderStyle || 'dashed';
  const label = nodeData.label || 'Zone';

  return (
    <div
      style={{
        minWidth: 300,
        minHeight: 200,
        width: '100%',
        height: '100%',
        border: `1px ${borderStyle} ${borderColor}`,
        borderRadius: 10,
        background: borderColor.startsWith('rgba')
          ? borderColor.replace(/[\d.]+\)$/, '0.06)')
          : `${borderColor}05`,
        padding: '40px 20px 20px 20px',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'border-color 0.15s ease',
        ...(selected ? { borderColor: 'var(--primary)' } : {}),
      }}
    >
      {/* Zone label */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 14,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: selected ? 'var(--primary)' : borderColor,
          lineHeight: '14px',
          userSelect: 'none',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeComponent);
