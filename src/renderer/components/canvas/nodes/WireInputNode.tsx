'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireInputNodeData {
  label: string;
  placeholder?: string;
  [key: string]: unknown;
}

function WireInputNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireInputNodeData;
  const label = nodeData.label || 'Input';
  const placeholder = nodeData.placeholder || 'Enter value...';

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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minWidth: 200,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--muted-foreground)',
          marginBottom: 4,
          lineHeight: '14px',
        }}
      >
        {label}
      </div>

      {/* Input mock */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${selected ? 'var(--primary)' : 'color-mix(in srgb, var(--foreground) 10%, transparent)'}`,
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--muted-foreground)',
          lineHeight: '16px',
          transition: 'border-color 0.15s ease',
        }}
      >
        {placeholder}
      </div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireInputNode = memo(WireInputNodeComponent);
