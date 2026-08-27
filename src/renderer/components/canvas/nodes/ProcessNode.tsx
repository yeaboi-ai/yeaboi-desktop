'use client';

import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { memo, useCallback, useRef } from 'react';
import { useDiagramView } from '../DiagramViewContext';

interface TechnicalDetail {
  method?: string;
  endpoint?: string;
  service?: string;
  notes?: string;
}

interface ProcessNodeData {
  label: string;
  description?: string;
  subflowIds?: string[];
  screenId?: string;
  technical?: TechnicalDetail;
  [key: string]: unknown;
}

const styles = {
  wrapper: {
    background: 'var(--canvas-node-bg)',
    borderWidth: 2,
    borderStyle: 'solid' as const,
    borderColor: 'var(--canvas-node-border)',
    borderRadius: 8,
    padding: '12px 20px',
    minWidth: 180,
    textAlign: 'center' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'border-color 0.15s ease',
    position: 'relative' as const,
  },
  wrapperSelected: {
    borderColor: 'var(--canvas-edge-selected)',
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--canvas-node-fg)',
    lineHeight: '18px',
  },
  description: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    lineHeight: '15px',
    marginTop: 3,
  },
  handle: {
    width: 6,
    height: 6,
    background: 'var(--canvas-handle)',
    border: '1px solid var(--canvas-handle)',
    borderRadius: '50%',
  },
};

const METHOD_COLORS: Record<string, string> = {
  GET: '#4ade80',
  POST: '#60a5fa',
  PUT: '#fbbf24',
  PATCH: '#fbbf24',
  DELETE: '#f87171',
};

function ProcessNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ProcessNodeData;
  const label = nodeData.label || 'Process';
  const viewMode = useDiagramView();
  const { setCenter, getNode, setNodes } = useReactFlow();

  const handleInfraClick = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const tryPan = (attempt: number) => {
        const targets = ids.map((id) => getNode(id)).filter(Boolean);
        if (targets.length === 0) {
          if (attempt < 12) {
            // Wirescreen the user clicked toward might still be generating.
            // Retry every 500ms for up to 6s before giving up.
            setTimeout(() => tryPan(attempt + 1), 500);
            return;
          }
          console.warn(
            '[ProcessNode] no node found for ids',
            ids,
            '— current wirescreen ids:',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__rf?.nodes
              ?.filter?.((n: any) => n.type === 'wirescreen')
              .map((n: any) => n.id),
          );
          return;
        }

        // Compute absolute positions by walking the parent chain
        const absolutePositions = targets.map((t) => {
          let absX = t!.position.x;
          let absY = t!.position.y;
          let parentId = (t as any).parentId;
          while (parentId) {
            const parent = getNode(parentId);
            if (!parent) break;
            absX += parent.position.x;
            absY += parent.position.y;
            parentId = (parent as any).parentId;
          }
          return { absX, absY };
        });

        // Compute bounding box using absolute positions
        const minX = Math.min(...absolutePositions.map((p) => p.absX));
        const maxX = Math.max(...absolutePositions.map((p) => p.absX));
        const minY = Math.min(...absolutePositions.map((p) => p.absY));
        const maxY = Math.max(...absolutePositions.map((p) => p.absY));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const firstTarget = targets[0]!;
        const tw =
          (firstTarget.width as number | undefined) ??
          ((firstTarget.style as any)?.width as number | undefined) ??
          200;
        const th =
          (firstTarget.height as number | undefined) ??
          ((firstTarget.style as any)?.height as number | undefined) ??
          200;
        setCenter(centerX + tw / 2, centerY + th / 2, { duration: 600, zoom: 0.4 });

        // Highlight the target nodes temporarily
        const highlightIds = new Set(ids);
        setNodes((nodes) =>
          nodes.map((n) =>
            highlightIds.has(n.id) ? { ...n, data: { ...n.data, _highlighted: true } } : n,
          ),
        );
        setTimeout(() => {
          setNodes((nodes) =>
            nodes.map((n) =>
              highlightIds.has(n.id) ? { ...n, data: { ...n.data, _highlighted: false } } : n,
            ),
          );
        }, 2500);
      };
      tryPan(0);
    },
    [getNode, setCenter, setNodes],
  );

  const hasSubflow = nodeData.subflowIds && nodeData.subflowIds.length > 0;
  const tech = nodeData.technical;
  const showTech =
    viewMode === 'technical' && tech && (tech.method || tech.endpoint || tech.service);

  // Notify wirescreens when this flow node is hovered so the linked
  // mockup can highlight itself. Plain CustomEvent avoids prop-drilling
  // through React Flow's data layer.
  const onHoverEnter = () => {
    if (typeof window !== 'undefined' && nodeData.screenId) {
      window.dispatchEvent(
        new CustomEvent('flow-hover', { detail: { screenId: nodeData.screenId } }),
      );
    }
  };
  const onHoverLeave = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flow-hover', { detail: { screenId: null } }));
    }
  };

  // Click-vs-drag detection. React Flow uses mousedown → drag start, so a
  // naive onClick on the wrapper would fire even after dragging the node.
  // We track the mousedown position + time; if the pointer moved more than
  // a few pixels OR more than ~300ms passed before mouseup, treat as drag
  // and swallow the implicit click. Otherwise pan to the linked screen.
  const pressStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent) => {
    pressStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const handleClick = (e: React.MouseEvent) => {
    if (!nodeData.screenId) return;
    const start = pressStartRef.current;
    pressStartRef.current = null;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    const dt = Date.now() - start.t;
    if (dx > 4 || dy > 4 || dt > 350) return; // dragged, not clicked
    e.stopPropagation();
    handleInfraClick([nodeData.screenId!]);
  };

  return (
    <div
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{
        ...styles.wrapper,
        ...(selected ? styles.wrapperSelected : {}),
        ...(hasSubflow
          ? { borderColor: 'rgba(229,166,48,0.4)', borderStyle: 'dashed' as const }
          : {}),
        ...(showTech ? { minWidth: 220 } : {}),
        ...(nodeData.screenId ? { cursor: 'pointer' } : {}),
      }}
    >
      <div style={styles.label}>{label}</div>
      {nodeData.description && <div style={styles.description}>{nodeData.description}</div>}

      {/* Technical overlay */}
      {showTech && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--canvas-node-border)',
            textAlign: 'left' as const,
          }}
        >
          {tech.method && tech.endpoint && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: METHOD_COLORS[tech.method.toUpperCase()] ?? 'var(--muted-foreground)',
                  letterSpacing: '0.03em',
                }}
              >
                {tech.method.toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: 'var(--muted-foreground)',
                }}
              >
                {tech.endpoint}
              </span>
            </div>
          )}
          {tech.service && (
            <div
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                color: 'var(--muted-foreground)',
                marginBottom: tech.notes ? 3 : 0,
              }}
            >
              {tech.service}
            </div>
          )}
          {tech.notes && (
            <div
              style={{
                fontSize: 9,
                color: 'var(--muted-foreground)',
                fontStyle: 'italic',
                lineHeight: '13px',
              }}
            >
              {tech.notes}
            </div>
          )}
        </div>
      )}

      {/* Screen link button removed — the entire ProcessNode wrapper is
          now clickable when nodeData.screenId is set, and the cursor
          changes to pointer to signal that. Click-vs-drag detection in
          handlePointerDown/handleClick prevents accidental pans during
          node moves. */}

      {/* Sub-flow expand button */}
      {hasSubflow && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleInfraClick(nodeData.subflowIds!);
          }}
          style={{
            position: 'absolute',
            bottom: -10,
            right: -10,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--canvas-node-bg)',
            border: '1.5px solid color-mix(in srgb, var(--primary) 50%, transparent)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            fontSize: 11,
            lineHeight: 1,
          }}
          title="View detailed sub-flow"
        >
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <Handle type="source" position={Position.Top} id="top" style={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={styles.handle} />
      <Handle type="source" position={Position.Left} id="left" style={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" style={styles.handle} />
    </div>
  );
}

export const ProcessNode = memo(ProcessNodeComponent);
