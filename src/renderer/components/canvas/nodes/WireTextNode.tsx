'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface WireTextNodeData {
  label: string;
  variant?: 'heading' | 'subheading' | 'body' | 'caption';
  [key: string]: unknown;
}

const variantStyles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: '28px',
  },
  subheading: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    lineHeight: '22px',
  },
  body: {
    fontSize: 13,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: '20px',
  },
  caption: {
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--muted-foreground)',
    lineHeight: '16px',
  },
};

function WireTextNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WireTextNodeData;
  const label = nodeData.label || 'Text';
  const variant = nodeData.variant || 'body';

  const handleStyle = {
    width: 4,
    height: 4,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '50%',
    opacity: selected ? 1 : 0,
    transition: 'opacity 0.15s ease',
  };

  return (
    <div
      style={{
        maxWidth: 320,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2px 4px',
        borderRadius: 4,
        border: selected ? '1px dashed rgba(229,166,48,0.3)' : '1px dashed transparent',
        transition: 'border-color 0.15s ease',
      }}
    >
      <div style={variantStyles[variant]}>{label}</div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireTextNode = memo(WireTextNodeComponent);
