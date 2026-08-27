'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireButtonNodeData {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline';
  [key: string]: unknown;
}

function WireButtonNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireButtonNodeData;
  const label = nodeData.label || 'Button';
  const variant = nodeData.variant || 'primary';

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'rgba(229,166,48,0.15)',
      borderWidth: 1,
      borderStyle: 'solid' as const,
      borderColor: 'rgba(229,166,48,0.3)',
      color: 'var(--primary)',
    },
    secondary: {
      background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
      borderWidth: 1,
      borderStyle: 'solid' as const,
      borderColor: 'rgba(255,255,255,0.12)',
      color: 'var(--muted-foreground)',
    },
    outline: {
      background: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid' as const,
      borderColor: 'color-mix(in srgb, var(--foreground) 15%, transparent)',
      color: 'var(--muted-foreground)',
    },
  };

  const handleStyle = {
    width: 5,
    height: 5,
    background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '50%',
  };

  return (
    <div
      style={{
        ...variantStyles[variant],
        borderRadius: 6,
        padding: '8px 20px',
        fontSize: 12,
        fontWeight: 500,
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        transition: 'border-color 0.15s ease',
        ...(selected ? { borderColor: 'var(--primary)' } : {}),
      }}
    >
      {label}

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireButtonNode = memo(WireButtonNodeComponent);
