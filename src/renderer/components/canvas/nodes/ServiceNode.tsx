'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

const providerColors: Record<string, string> = {
  aws: '#ff9900',
  gcp: '#4285f4',
  azure: '#00bcf2',
  vercel: 'var(--primary-foreground)',
  cloudflare: '#f38020',
  default: '#888888',
};

interface ServiceNodeData {
  label: string;
  description?: string;
  iconUrl?: string;
  provider?: string;
  _highlighted?: boolean;
  [key: string]: unknown;
}

const styles = {
  wrapper: {
    background: 'var(--card)',
    borderWidth: 1.5,
    borderStyle: 'solid' as const,
    borderColor: 'var(--muted-foreground)',
    borderRadius: 8,
    padding: 12,
    minWidth: 260,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    position: 'relative' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'border-color 0.15s ease',
  },
  wrapperSelected: {
    borderColor: 'var(--primary)',
  },
  wrapperHighlighted: {
    borderColor: 'rgba(255,153,0,0.8)',
    boxShadow: '0 0 16px rgba(255,153,0,0.35), 0 0 4px rgba(255,153,0,0.2)',
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden' as const,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    objectFit: 'contain' as const,
  },
  fallbackIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--foreground)',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground)',
    lineHeight: '18px',
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
  },
  description: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    lineHeight: '15px',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  providerBadge: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  handle: {
    width: 6,
    height: 6,
    background: 'color-mix(in srgb, var(--foreground) 15%, transparent)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '50%',
  },
};

function ServiceNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ServiceNodeData;
  const provider = (nodeData.provider || 'default').toLowerCase();
  const providerColor = providerColors[provider] || providerColors.default;
  const label = nodeData.label || 'Service';
  const firstLetter = label.charAt(0).toUpperCase();
  const isHighlighted = !!(nodeData as ServiceNodeData)._highlighted;

  return (
    <div
      style={{
        ...styles.wrapper,
        ...(selected ? styles.wrapperSelected : {}),
        ...(isHighlighted ? styles.wrapperHighlighted : {}),
      }}
    >
      {/* Provider badge */}
      {nodeData.provider && (
        <div
          style={{
            ...styles.providerBadge,
            background: providerColor,
          }}
        />
      )}

      {/* Icon */}
      <div style={styles.iconContainer}>
        {nodeData.iconUrl ? (
          <img src={nodeData.iconUrl} alt={label} style={styles.icon} draggable={false} />
        ) : (
          <div
            style={{
              ...styles.fallbackIcon,
              background: `${providerColor}22`,
              color:
                providerColor === 'var(--primary-foreground)' ? 'var(--foreground)' : providerColor,
            }}
          >
            {firstLetter}
          </div>
        )}
      </div>

      {/* Text */}
      <div style={styles.textContainer}>
        <div style={styles.label}>{label}</div>
        {nodeData.description && <div style={styles.description}>{nodeData.description}</div>}
      </div>

      {/* Handles */}
      <Handle type="source" position={Position.Top} id="top" style={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={styles.handle} />
      <Handle type="source" position={Position.Left} id="left" style={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" style={styles.handle} />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);
