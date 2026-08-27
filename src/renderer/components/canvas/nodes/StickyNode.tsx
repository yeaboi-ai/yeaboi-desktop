'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useState, useCallback } from 'react';

interface StickyNodeData {
  label: string;
  color?: string;
  [key: string]: unknown;
}

const defaultColor = 'rgba(250,204,21,0.15)';
const defaultBorderColor = 'rgba(250,204,21,0.25)';
const defaultTextColor = 'rgba(250,204,21,0.9)';

const styles = {
  wrapper: {
    borderRadius: 4,
    padding: 14,
    minWidth: 140,
    minHeight: 80,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    cursor: 'default',
    position: 'relative' as const,
  },
  text: {
    fontSize: 13,
    lineHeight: '20px',
    outline: 'none',
    border: 'none',
    background: 'transparent',
    resize: 'none' as const,
    width: '100%',
    minHeight: 50,
    fontFamily: 'inherit',
  },
  handle: {
    width: 5,
    height: 5,
    background: 'rgba(250,204,21,0.2)',
    border: '1px solid rgba(250,204,21,0.3)',
    borderRadius: '50%',
  },
};

function StickyNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as StickyNodeData;
  const bgColor = nodeData.color || defaultColor;
  const label = nodeData.label || '';

  const [text, setText] = useState(label);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  return (
    <div
      style={{
        ...styles.wrapper,
        background: bgColor,
        border: `1px solid ${selected ? 'var(--primary)' : defaultBorderColor}`,
        boxShadow: selected ? '0 0 0 1px var(--primary)' : 'none',
      }}
    >
      <textarea
        value={text}
        onChange={handleChange}
        style={{
          ...styles.text,
          color: defaultTextColor,
        }}
        placeholder="Write a note..."
      />

      <Handle type="target" position={Position.Top} id="top" style={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={styles.handle} />
      <Handle type="target" position={Position.Left} id="left" style={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" style={styles.handle} />
    </div>
  );
}

export const StickyNode = memo(StickyNodeComponent);
