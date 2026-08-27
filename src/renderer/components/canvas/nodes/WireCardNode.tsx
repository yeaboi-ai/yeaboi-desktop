'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireCardNodeData {
  label: string;
  description?: string;
  hasImage?: boolean;
  [key: string]: unknown;
}

function WireCardNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireCardNodeData;
  const label = nodeData.label || 'Card';

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
        width: 240,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'var(--primary)' : 'color-mix(in srgb, var(--foreground) 8%, transparent)'}`,
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Optional image placeholder */}
      {nodeData.hasImage && (
        <div
          style={{
            height: 120,
            background: 'color-mix(in srgb, var(--foreground) 2%, transparent)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--foreground) 15%, transparent)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      )}

      {/* Card content */}
      <div style={{ padding: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
            lineHeight: '18px',
            marginBottom: nodeData.description ? 4 : 0,
          }}
        >
          {label}
        </div>
        {nodeData.description && (
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              lineHeight: '16px',
            }}
          >
            {nodeData.description}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireCardNode = memo(WireCardNodeComponent);
