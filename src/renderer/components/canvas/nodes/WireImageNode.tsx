'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireImageNodeData {
  label: string;
  width?: number;
  height?: number;
  src?: string;
  [key: string]: unknown;
}

function WireImageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireImageNodeData;
  const label = nodeData.label || 'Image';
  const w = nodeData.width || 200;
  const h = nodeData.height || 150;

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
        width: w,
        height: h,
        background: 'color-mix(in srgb, var(--foreground) 2%, transparent)',
        border: `1px solid ${selected ? 'var(--primary)' : 'color-mix(in srgb, var(--foreground) 8%, transparent)'}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'border-color 0.15s ease',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {nodeData.src ? (
        <img
          src={nodeData.src}
          alt={label}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          draggable={false}
        />
      ) : (
        <>
          {/* Placeholder icon */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span
            style={{
              fontSize: 10,
              color: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
              userSelect: 'none',
            }}
          >
            {label}
          </span>
        </>
      )}

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireImageNode = memo(WireImageNodeComponent);
