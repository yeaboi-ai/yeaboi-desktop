'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireNavNodeData {
  label: string;
  items?: string[];
  [key: string]: unknown;
}

function WireNavNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireNavNodeData;
  const label = nodeData.label || 'Navigation';
  const items = nodeData.items || ['Home', 'About', 'Contact'];

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
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'var(--primary)' : 'color-mix(in srgb, var(--foreground) 8%, transparent)'}`,
        borderRadius: 8,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'border-color 0.15s ease',
        minWidth: 300,
      }}
    >
      {/* Logo / Brand */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 16,
          background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
          flexShrink: 0,
        }}
      />

      {/* Nav items */}
      <div style={{ display: 'flex', gap: 14, flex: 1 }}>
        {items.map((item, idx) => (
          <span
            key={idx}
            style={{
              fontSize: 11,
              color: idx === 0 ? 'var(--muted-foreground)' : 'var(--muted-foreground)',
              fontWeight: idx === 0 ? 500 : 400,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {item}
          </span>
        ))}
      </div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireNavNode = memo(WireNavNodeComponent);
