'use client';

import { memo, useCallback } from 'react';
import type { CanvasMode } from './FreehandLayer';
import type { DiagramViewMode } from './DiagramViewContext';

interface CanvasToolbarProps {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onClear?: () => void;
  viewMode?: DiagramViewMode;
  onViewModeChange?: (mode: DiagramViewMode) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const modes: { id: CanvasMode; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'boxSelect', label: 'Box Select', shortcut: 'B' },
  { id: 'lasso', label: 'Lasso', shortcut: 'G' },
  { id: 'draw', label: 'Draw', shortcut: 'D' },
  { id: 'line', label: 'Line', shortcut: 'X' },
  { id: 'laser', label: 'Laser', shortcut: 'L' },
  { id: 'sticky', label: 'Sticky', shortcut: 'S' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E' },
];

const iconSize = 20;

function CursorIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 2l9.5 5.5-4.2 1.3-2.5 3.7L3 2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function BoxSelectIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" fill="none" />
      <path d="M2 5V3a1 1 0 011-1h2M11 2h2a1 1 0 011 1v2M14 11v2a1 1 0 01-1 1h-2M5 14H3a1 1 0 01-1-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LassoIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="7" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M11 10c1 1.5 0.5 3.5-1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path
        d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M9.5 4.5l2 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="3" cy="13" r="1.5" fill="currentColor" />
      <circle cx="13" cy="3" r="1.5" fill="currentColor" />
    </svg>
  );
}

function LaserIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="8" y1="2" x2="8" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="12" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="2" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10.4" y1="10.4" x2="11.8" y2="11.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.2" y1="11.8" x2="5.6" y2="10.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10.4" y1="5.6" x2="11.8" y2="4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path d="M10.5 2.5l3 3-7 7H3l-1-1 1.5-1.5 7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <path d="M8.5 4.5l3 3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="3" y1="14" x2="13" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StickyIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 2h10v9l-3 3H3V2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M10 11v3l3-3h-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const iconMap: Record<CanvasMode, () => React.ReactNode> = {
  select: CursorIcon,
  boxSelect: BoxSelectIcon,
  lasso: LassoIcon,
  draw: PencilIcon,
  line: LineIcon,
  laser: LaserIcon,
  sticky: StickyIcon,
  eraser: EraserIcon,
};

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 9999,
    padding: '6px 12px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
  } as React.CSSProperties,
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 9999,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease',
    position: 'relative' as const,
    padding: 0,
  } as React.CSSProperties,
  buttonActive: {
    background: 'rgba(229,166,48,0.15)',
    color: 'var(--primary)',
  } as React.CSSProperties,
  buttonHover: {
    background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
    color: 'rgba(255,255,255,0.7)',
  },
  label: {
    fontSize: 9,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--muted-foreground)',
    marginLeft: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  separator: {
    width: 1,
    height: 16,
    background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
    margin: '0 2px',
  } as React.CSSProperties,
  shortcut: {
    position: 'absolute' as const,
    bottom: 1,
    right: 2,
    fontSize: 7,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
    color: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
    lineHeight: 1,
    userSelect: 'none' as const,
  } as React.CSSProperties,
};

function MaximizeIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path d="M3 6V3.5A0.5.5 0 013.5 3H6M10 3h2.5a0.5.5 0 01.5.5V6M13 10v2.5a0.5.5 0 01-.5.5H10M6 13H3.5a0.5.5 0 01-.5-.5V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
      <path d="M6 3v2.5a0.5.5 0 01-.5.5H3M10 3v2.5a0.5.5 0 00.5.5H13M10 13v-2.5a0.5.5 0 01.5-.5H13M6 13v-2.5a0.5.5 0 00-.5-.5H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CanvasToolbarComponent({ mode, onModeChange, onClear, viewMode = 'ux', onViewModeChange, fullscreen = false, onToggleFullscreen }: CanvasToolbarProps) {
  const handleClick = useCallback(
    (m: CanvasMode) => () => {
      onModeChange(m);
    },
    [onModeChange],
  );

  return (
    <div style={styles.toolbar}>
      {modes.map((m, i) => {
        const Icon = iconMap[m.id];
        const isActive = mode === m.id;

        return (
          <span key={m.id} style={{ display: 'flex', alignItems: 'center' }}>
            {m.id === 'draw' && <div style={styles.separator} />}
            <button
              onClick={handleClick(m.id)}
              title={`${m.label} (${m.shortcut})`}
              style={{
                ...styles.button,
                ...(isActive ? styles.buttonActive : {}),
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
                }
              }}
            >
              <Icon />
            </button>
          </span>
        );
      })}

      {/* Separator + Clear */}
      <div style={styles.separator} />
      <button
        onClick={onClear}
        title="Clear all drawings"
        style={styles.button}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,50,50,0.1)';
          e.currentTarget.style.color = 'rgba(255,100,100,0.8)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* View mode toggle */}
      {onViewModeChange && (
        <>
          <div style={styles.separator} />
          <button
            onClick={() => onViewModeChange(viewMode === 'ux' ? 'technical' : 'ux')}
            title={viewMode === 'ux' ? 'Switch to technical view' : 'Switch to UX view'}
            style={{
              ...styles.button,
              ...(viewMode === 'technical' ? styles.buttonActive : {}),
              width: 'auto',
              padding: '0 10px',
              gap: 5,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'technical') {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'technical') {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
              }
            }}
          >
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
              <path d="M5.5 3L2 8l3.5 5M10.5 3L14 8l-3.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 10, fontFamily: 'inherit', fontWeight: 500 }}>
              {viewMode === 'ux' ? 'UX' : 'API'}
            </span>
          </button>
        </>
      )}

      {/* Mode label */}
      {mode !== 'select' && <span style={styles.label}>{mode}</span>}

      {/* Fullscreen toggle — hides surrounding UI (top bar, drawers) so the
          canvas owns the whole viewport. Escape exits. */}
      {onToggleFullscreen && (
        <>
          <div style={styles.separator} />
          <button
            onClick={onToggleFullscreen}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            style={styles.button}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
            }}
          >
            {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
        </>
      )}
    </div>
  );
}

export const CanvasToolbar = memo(CanvasToolbarComponent);
