'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface DecisionNodeData {
  label: string;
  [key: string]: unknown;
}

const DIAMOND_SIZE = 120;

const styles = {
  wrapper: {
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    width: DIAMOND_SIZE * 0.72,
    height: DIAMOND_SIZE * 0.72,
    background: 'var(--card)',
    borderWidth: 2,
    borderStyle: 'solid' as const,
    borderColor: 'var(--muted-foreground)',
    transform: 'rotate(45deg)',
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    marginTop: -(DIAMOND_SIZE * 0.72) / 2,
    marginLeft: -(DIAMOND_SIZE * 0.72) / 2,
    transition: 'border-color 0.15s ease',
  },
  diamondSelected: {
    borderColor: 'var(--primary)',
  },
  label: {
    position: 'relative' as const,
    zIndex: 1,
    fontSize: 11,
    color: 'var(--foreground)',
    textAlign: 'center' as const,
    lineHeight: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    // Diamond is rotated 45°, so the label's usable width is the inner
    // square's diagonal — roughly the diamond size itself. Give the label
    // most of that span so single words like "Authenticated?" don't break
    // mid-word. `overflowWrap: anywhere` is the safety net for truly long
    // labels; `wordBreak: keep-all` keeps normal words intact.
    maxWidth: DIAMOND_SIZE * 0.8,
    padding: '0 6px',
    wordBreak: 'keep-all' as const,
    overflowWrap: 'anywhere' as const,
    hyphens: 'auto' as const,
    userSelect: 'none' as const,
  },
  handle: {
    width: 6,
    height: 6,
    background: 'color-mix(in srgb, var(--foreground) 15%, transparent)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '50%',
  },
};

function DecisionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as DecisionNodeData;
  const label = nodeData.label || '?';

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.diamond,
          ...(selected ? styles.diamondSelected : {}),
        }}
      />
      <div style={styles.label}>{label}</div>

      <Handle type="source" position={Position.Top} id="top" style={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={styles.handle} />
      <Handle type="source" position={Position.Left} id="left" style={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" style={styles.handle} />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
