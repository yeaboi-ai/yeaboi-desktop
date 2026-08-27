'use client';

import { memo, useState } from 'react';

interface NodeHoverMenuProps {
  nodeId: string;
  onEdit?: () => void;
  onEditWithAI?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

function NodeHoverMenuComponent({
  onEdit,
  onEditWithAI,
  onDuplicate,
  onDelete,
}: NodeHoverMenuProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'rgba(18,18,18,0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '3px 4px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        zIndex: 50,
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* AI Edit — always visible */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditWithAI?.();
        }}
        title="Edit with AI"
        style={btnStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(229,166,48,0.15)';
          e.currentTarget.style.color = 'var(--primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--muted-foreground)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12 6.5 8.5 3 7l3.5-1.5L8 2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Edit text */}
      {expanded && onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              'color-mix(in srgb, var(--foreground) 8%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Duplicate */}
      {expanded && onDuplicate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate"
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              'color-mix(in srgb, var(--foreground) 8%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect
              x="5"
              y="5"
              width="8"
              height="8"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path d="M3 11V3h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* Delete */}
      {expanded && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          style={{ ...btnStyle, color: 'rgba(255,100,100,0.6)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,50,50,0.1)';
            e.currentTarget.style.color = 'rgba(255,100,100,0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,100,100,0.6)';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transition: 'background 0.12s, color 0.12s',
  padding: 0,
};

export const NodeHoverMenu = memo(NodeHoverMenuComponent);
