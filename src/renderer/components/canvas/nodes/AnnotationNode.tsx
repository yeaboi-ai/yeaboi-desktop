'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function ZoneActionDropdown({
  options,
  value,
  onSelect,
  icon,
  title,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  icon: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position the portal'd popover beneath the trigger button. Anchored
  // via getBoundingClientRect because once we render via portal the
  // popover is no longer a descendant of the trigger and can't use
  // CSS-level `top: 100%` etc. Recompute on open + on scroll/resize.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const popoverContent =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            className="nodrag"
            style={{
              position: 'fixed',
              top: coords.top,
              right: coords.right,
              background: 'rgba(20,20,24,0.96)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: 4,
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 1000,
            }}
          >
            {options.map((opt) => {
              const selected = opt === value;
              return (
                <button
                  key={opt}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(opt);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: selected ? 'rgba(229,166,48,0.10)' : 'transparent',
                    border: 'none',
                    color: selected ? 'rgba(229,166,48,0.95)' : 'rgba(255,255,255,0.85)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: 0,
                    textTransform: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected)
                      e.currentTarget.style.background =
                        'color-mix(in srgb, var(--foreground) 6%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ flex: 1 }}>{opt}</span>
                  {selected && <span style={{ fontSize: 11, opacity: 0.7 }}>✓</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} className="nodrag">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 12px',
          borderRadius: 999,
          background: open
            ? 'color-mix(in srgb, var(--foreground) 8%, transparent)'
            : 'color-mix(in srgb, var(--foreground) 4%, transparent)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)'}`,
          color: open ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.95 }}>{icon}</span>
        <span>{value}</span>
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▾</span>
      </button>
      {popoverContent}
    </div>
  );
}

function ZoneActionButton({
  onClick,
  label,
  icon,
  title,
  primary = false,
}: {
  onClick: () => void;
  label: string;
  icon: string;
  title: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: label ? '0 12px' : '0 10px',
        borderRadius: 999,
        background: primary
          ? 'rgba(229,166,48,0.16)'
          : 'color-mix(in srgb, var(--foreground) 4%, transparent)',
        border: `1px solid ${primary ? 'rgba(229,166,48,0.45)' : 'rgba(255,255,255,0.10)'}`,
        color: primary ? 'rgba(229,166,48,0.95)' : 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = primary
          ? 'rgba(229,166,48,0.24)'
          : 'color-mix(in srgb, var(--foreground) 8%, transparent)';
        el.style.borderColor = primary ? 'rgba(229,166,48,0.65)' : 'rgba(255,255,255,0.18)';
        el.style.color = primary ? 'rgba(229,166,48,1)' : 'rgba(255,255,255,0.95)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = primary
          ? 'rgba(229,166,48,0.16)'
          : 'color-mix(in srgb, var(--foreground) 4%, transparent)';
        el.style.borderColor = primary ? 'rgba(229,166,48,0.45)' : 'rgba(255,255,255,0.10)';
        el.style.color = primary ? 'rgba(229,166,48,0.95)' : 'rgba(255,255,255,0.7)';
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.95 }}>{icon}</span>
      {label && <span>{label}</span>}
    </button>
  );
}

interface AnnotationNodeData {
  label: string;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  letterSpacing?: string;
  _isZoneHeader?: boolean;
  _isSubHeader?: boolean;
  _zoneType?: string;
  _metaLine?: string; // eyebrow / kicker line above the title
  _subtitle?: string; // italic serif tagline below the title
  // Wireframe-zone action callbacks. Wired up only when _zoneType === 'wireframe'.
  // Each is optional so older callers don't have to provide them.
  _onToggleDarkMode?: () => void;
  _isDarkMode?: boolean;
  _onSelectPalette?: (palette: string) => void;
  _currentPalette?: string;
  _palettes?: string[];
  _onSimulate?: () => void;
  _onMoreActions?: () => void;
  [key: string]: unknown;
}

function AnnotationNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AnnotationNodeData;
  const label = nodeData.label || '';
  const fontSize = nodeData.fontSize || 13;
  const color = nodeData.color || 'var(--muted-foreground)';
  const fontWeight = nodeData.fontWeight || 400;
  const letterSpacing = nodeData.letterSpacing || 'normal';
  const isHeader = nodeData._isZoneHeader === true;
  const isSubHeader = nodeData._isSubHeader === true;
  // Use the editorial header (eyebrow + 56px serif title + italic subtitle)
  // for every zone header, not just wireframe — the user wanted the flow,
  // architecture, and ERD zones to share the same visual treatment.
  const isEditorialHeader = isHeader && !!nodeData._metaLine;
  const metaLine = nodeData._metaLine;
  const subtitle = nodeData._subtitle;

  const handleStyle = {
    width: 4,
    height: 4,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '50%',
    opacity: isHeader ? 0 : selected ? 1 : 0,
    pointerEvents: (isHeader ? 'none' : 'auto') as any,
    transition: 'opacity 0.15s ease',
  };

  // Sub-section header (e.g. DESKTOP / MOBILE under wireframe zone) — small
  // tracked-out caps with a hairline rule.
  if (isSubHeader) {
    return (
      <div
        style={{
          padding: '4px 4px 12px',
          minWidth: 1200,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontSize: 16,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.62)',
            fontWeight: 600,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {label}
        </div>
        <Handle type="target" position={Position.Top} style={handleStyle} />
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      </div>
    );
  }

  // Editorial zone header: eyebrow meta + serif title + italic tagline.
  if (isEditorialHeader) {
    const isWireframeZone = nodeData._zoneType === 'wireframe';
    const hasActions =
      isWireframeZone &&
      (nodeData._onToggleDarkMode ||
        nodeData._onSelectPalette ||
        nodeData._onSimulate ||
        nodeData._onMoreActions);
    return (
      <div
        style={{
          padding: '24px 4px 32px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          minWidth: 520,
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'rgba(229,166,48,0.85)',
            marginBottom: 14,
          }}
        >
          {metaLine || 'UI · SCREENS'}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily:
                  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
                fontSize: 80,
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'rgba(255,255,255,0.95)',
                lineHeight: 1.04,
                marginBottom: 12,
              }}
            >
              {label}
            </div>
            {subtitle && (
              <div
                style={{
                  fontFamily:
                    '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
                  fontSize: 26,
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.3,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {hasActions && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                paddingBottom: 16,
                pointerEvents: 'auto',
              }}
              className="nodrag"
            >
              {nodeData._onToggleDarkMode && (
                <ZoneActionButton
                  onClick={nodeData._onToggleDarkMode}
                  label={nodeData._isDarkMode ? 'Light' : 'Dark'}
                  icon={nodeData._isDarkMode ? '☀' : '☾'}
                  title="Toggle wireframe theme"
                />
              )}
              {nodeData._onSelectPalette && (nodeData._palettes?.length ?? 0) > 0 && (
                <ZoneActionDropdown
                  options={nodeData._palettes || []}
                  value={nodeData._currentPalette || nodeData._palettes?.[0] || ''}
                  onSelect={nodeData._onSelectPalette}
                  icon="◐"
                  title="Choose palette"
                />
              )}
              {nodeData._onSimulate && (
                <ZoneActionButton
                  onClick={nodeData._onSimulate}
                  label="Simulate"
                  icon="▶"
                  title="Run interactive simulation"
                  primary
                />
              )}
              {nodeData._onMoreActions && (
                <ZoneActionButton
                  onClick={nodeData._onMoreActions}
                  label=""
                  icon="⋯"
                  title="More options"
                />
              )}
            </div>
          )}
        </div>
        <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
        <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: isHeader ? 0 : '4px 8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: isHeader ? undefined : 300,
        borderRadius: 4,
        border:
          selected && !isHeader ? '1px dashed rgba(229,166,48,0.3)' : '1px dashed transparent',
        transition: 'border-color 0.15s ease',
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight,
          letterSpacing,
          textTransform: isHeader ? ('uppercase' as const) : undefined,
          color,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          userSelect: 'none',
        }}
      >
        {label}
      </div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const AnnotationNode = memo(AnnotationNodeComponent);
