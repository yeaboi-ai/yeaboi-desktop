'use client';

import { useEffect, useRef, useCallback } from 'react';

interface ElementContextMenuProps {
  nodeId: string;
  nodeType: string;
  nodeData: any;
  position: { x: number; y: number };
  onClose: () => void;
  onUpdate: (nodeId: string, newData: any) => void;
  onEditWithAI: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditText: () => void;
}

const SparkleIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    style={{ flexShrink: 0 }}
  >
    <path
      d="M8 0L9.79 6.21L16 8L9.79 9.79L8 16L6.21 9.79L0 8L6.21 6.21L8 0Z"
      fill="var(--primary)"
    />
  </svg>
);

const menuStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9999,
  },
  menu: {
    position: 'fixed' as const,
    zIndex: 10000,
    background: 'var(--card)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    width: 180,
    padding: '4px 0',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left' as const,
    lineHeight: '16px',
    transition: 'background 0.1s ease, color 0.1s ease',
  },
  itemHover: {
    background: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
    color: 'var(--foreground)',
  },
  itemDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  separator: {
    height: 1,
    background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
    margin: '4px 0',
  },
  aiLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
};

interface MenuItemProps {
  label: string | React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ label, onClick, disabled }: MenuItemProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      style={{
        ...menuStyles.item,
        ...(disabled ? menuStyles.itemDisabled : {}),
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      onMouseEnter={() => {
        if (ref.current && !disabled) {
          Object.assign(ref.current.style, {
            background: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
            color: 'var(--foreground)',
          });
        }
      }}
      onMouseLeave={() => {
        if (ref.current && !disabled) {
          Object.assign(ref.current.style, {
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
          });
        }
      }}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default function ElementContextMenu({
  nodeId: _nodeId,
  nodeType: _nodeType,
  nodeData: _nodeData,
  position,
  onClose,
  onUpdate: _onUpdate,
  onEditWithAI,
  onDuplicate,
  onDelete,
  onEditText,
}: ElementContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Adjust position to keep menu within viewport
  const adjustedPosition = { ...position };
  if (typeof window !== 'undefined') {
    if (adjustedPosition.x + 180 > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - 190;
    }
    if (adjustedPosition.y + 220 > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - 230;
    }
  }

  return (
    <>
      {/* Invisible overlay to catch outside clicks */}
      <div style={menuStyles.overlay} onClick={onClose} />

      {/* Context menu */}
      <div
        ref={menuRef}
        style={{
          ...menuStyles.menu,
          left: adjustedPosition.x,
          top: adjustedPosition.y,
        }}
      >
        <MenuItem label="Edit Text" onClick={onEditText} />

        <MenuItem
          label={
            <span style={menuStyles.aiLabel}>
              <SparkleIcon />
              Edit with AI
            </span>
          }
          onClick={onEditWithAI}
        />

        <div style={menuStyles.separator} />

        <MenuItem label="Duplicate" onClick={onDuplicate} />
        <MenuItem label="Delete" onClick={onDelete} />

        <div style={menuStyles.separator} />

        <MenuItem label="Style..." onClick={() => {}} disabled />
      </div>
    </>
  );
}
