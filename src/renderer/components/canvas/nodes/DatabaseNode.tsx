'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface Column {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
}

interface DatabaseNodeData {
  label: string;
  columns?: Column[];
  [key: string]: unknown;
}

const styles = {
  wrapper: {
    background: 'var(--canvas-node-bg)',
    borderWidth: 1.5,
    borderStyle: 'solid' as const,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 8,
    overflow: 'hidden' as const,
    minWidth: 200,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'border-color 0.15s ease',
  },
  wrapperSelected: {
    borderColor: 'var(--primary)',
  },
  header: {
    background: 'rgba(229,166,48,0.15)',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--primary)',
    lineHeight: '18px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    position: 'relative' as const,
    gap: 12,
  },
  columnLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  columnName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  columnType: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    lineHeight: '15px',
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  badge: {
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 4px',
    borderRadius: 3,
    lineHeight: '13px',
    flexShrink: 0,
  },
  pkBadge: {
    background: 'rgba(229,166,48,0.2)',
    color: 'var(--primary)',
  },
  fkBadge: {
    background: 'rgba(100,149,237,0.2)',
    color: '#6495ed',
  },
  handle: {
    width: 5,
    height: 5,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '50%',
  },
};

function DatabaseNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as DatabaseNodeData;
  const label = nodeData.label || 'Table';
  const columns = nodeData.columns || [];

  return (
    <div
      style={{
        ...styles.wrapper,
        ...(selected ? styles.wrapperSelected : {}),
      }}
    >
      {/* Table header */}
      <div style={styles.header}>{label}</div>

      {/* Column rows */}
      {columns.map((col, idx) => (
        <div key={col.name || idx} style={styles.row}>
          {/* Left handle for this column */}
          <Handle
            type="source"
            position={Position.Left}
            id={`${col.name}-left`}
            style={{
              ...styles.handle,
              top: '50%',
            }}
          />

          <div style={styles.columnLeft}>
            {col.pk && <span style={{ ...styles.badge, ...styles.pkBadge }}>PK</span>}
            {col.fk && <span style={{ ...styles.badge, ...styles.fkBadge }}>FK</span>}
            <span style={styles.columnName}>{col.name}</span>
          </div>

          <span style={styles.columnType}>{col.type}</span>

          {/* Right handle for this column */}
          <Handle
            type="source"
            position={Position.Right}
            id={`${col.name}-right`}
            style={{
              ...styles.handle,
              top: '50%',
            }}
          />
        </div>
      ))}

      {/* Fallback handles when no columns */}
      {columns.length === 0 && (
        <>
          <Handle type="source" position={Position.Left} id="left" style={styles.handle} />
          <Handle type="source" position={Position.Right} id="right" style={styles.handle} />
        </>
      )}
    </div>
  );
}

export const DatabaseNode = memo(DatabaseNodeComponent);
