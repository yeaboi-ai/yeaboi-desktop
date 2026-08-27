'use client';

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { useTheme } from '@/components/providers/theme-provider';

import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import FreehandLayer, { type CanvasMode } from './FreehandLayer';
import { CanvasToolbar } from './CanvasToolbar';
import { DiagramViewProvider, type DiagramViewMode } from './DiagramViewContext';
import { NodeHoverMenu } from './nodes/NodeHoverMenu';
import ElementContextMenu from './ai/ElementContextMenu';
import AIEditModal from './ai/AIEditModal';
import { buildEditContext } from './ai/element-editor';

interface ContextMenuState {
  nodeId: string;
  nodeType: string;
  nodeData: Record<string, unknown>;
  position: { x: number; y: number };
}

interface AIEditState {
  nodeId: string;
  nodeType: string;
  nodeData: Record<string, unknown>;
  diagramContext: Record<string, unknown>;
}

type AuthFetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface CanvasEngineProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  sessionId?: string;
  authFetch?: AuthFetchFn;
  className?: string;
  onClearCanvas?: () => void;
  onClearChat?: () => void;
  chatOpen?: boolean;
  blueprintOpen?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

/** Inner component that has access to the ReactFlow instance via hooks. */
function CanvasEngineInner({
  initialNodes = [],
  initialEdges = [],
  onNodesChange: onNodesChangeCallback,
  onEdgesChange: onEdgesChangeCallback,
  sessionId,
  authFetch,
  onClearCanvas,
  onClearChat,
  chatOpen = false,
  blueprintOpen = false,
  fullscreen = false,
  onToggleFullscreen,
}: Omit<CanvasEngineProps, 'className'>) {
  const { colorScheme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  const [mode, setMode] = useState<CanvasMode>('select');
  const [viewMode, setViewMode] = useState<DiagramViewMode>('ux');
  const [clearSignal, setClearSignal] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [aiEdit, setAiEdit] = useState<AIEditState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // ── Undo / Redo ──
  const MAX_HISTORY = 50;
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-strip function values (and other non-serialisable things) so node data
  // can pass through structuredClone without throwing. Returns plain JSON-safe copy.
  function stripNonCloneable<T>(val: T): T {
    if (val === null || val === undefined) return val;
    const t = typeof val;
    if (t === 'function' || t === 'symbol') return undefined as unknown as T;
    if (t !== 'object') return val;
    if (Array.isArray(val)) return val.map(stripNonCloneable) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as object)) {
      if (typeof v === 'function' || typeof v === 'symbol') continue;
      out[k] = stripNonCloneable(v);
    }
    return out as T;
  }

  // Take a snapshot after a debounce (avoids capturing every micro-change during drags).
  // Node data may contain callbacks (e.g. onEnhance for wireframe nodes) that
  // structuredClone can't serialize. Strip non-cloneable values before snapshotting —
  // history only needs the visual shape; live callbacks are re-injected by the
  // session page whenever nodes come from the server or an undo.
  const scheduleSnapshot = useCallback(() => {
    if (isUndoRedoRef.current) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      const sanitizedNodes = nodesRef.current.map((n) => ({
        ...n,
        data: stripNonCloneable(n.data),
      }));
      const snap = {
        nodes: structuredClone(sanitizedNodes),
        edges: structuredClone(edgesRef.current),
      };
      const hist = historyRef.current;
      const idx = historyIndexRef.current;
      // Truncate any future states if we branched
      historyRef.current = hist.slice(0, idx + 1);
      historyRef.current.push(snap);
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
      historyIndexRef.current = historyRef.current.length - 1;
    }, 300);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    if (onNodesChangeCallback) setTimeout(() => onNodesChangeCallback(snap.nodes), 0);
    if (onEdgesChangeCallback) setTimeout(() => onEdgesChangeCallback(snap.edges), 0);
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50);
  }, [setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    if (onNodesChangeCallback) setTimeout(() => onNodesChangeCallback(snap.nodes), 0);
    if (onEdgesChangeCallback) setTimeout(() => onEdgesChangeCallback(snap.edges), 0);
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50);
  }, [setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback]);

  const { screenToFlowPosition, getNodes, getEdges, fitView, getNodesBounds, setViewport } =
    useReactFlow();
  const viewport = useViewport();

  // fitView that accounts for open drawers — single pan, no correction
  const drawerAwareFitView = useCallback(
    (duration = 400) => {
      const leftInset = chatOpen ? 380 : 0;
      const rightInset = blueprintOpen ? 420 : 0;
      if (!leftInset && !rightInset) {
        fitView({ padding: 0.15, duration });
        return;
      }
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      if (!container) {
        fitView({ padding: 0.15, duration });
        return;
      }
      const allNodes = getNodes();
      if (allNodes.length === 0) {
        fitView({ padding: 0.15, duration });
        return;
      }
      const bounds = getNodesBounds(allNodes);
      const totalW = container.clientWidth;
      const totalH = container.clientHeight;
      const visibleW = totalW - leftInset - rightInset;
      const pad = 0.12;
      const zoom = Math.min(
        (visibleW * (1 - pad * 2)) / Math.max(bounds.width, 1),
        (totalH * (1 - pad * 2)) / Math.max(bounds.height, 1),
        1,
      );
      const cx = leftInset + visibleW / 2;
      const cy = totalH / 2;
      const x = cx - (bounds.x + bounds.width / 2) * zoom;
      const y = cy - (bounds.y + bounds.height / 2) * zoom;
      setViewport({ x, y, zoom }, { duration });
    },
    [chatOpen, blueprintOpen, fitView, getNodes, getNodesBounds, setViewport],
  );

  // Auto-save canvas to backend (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionId || !authFetch || nodes.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Strip animation artifacts before persisting
      const cleanNodes = nodes.map((n) => {
        if (!n.style) return n;
        const { opacity, transition, animationDelay, ...rest } = n.style as Record<string, unknown>;
        const cleanStyle = Object.keys(rest).length > 0 ? rest : undefined;
        return { ...n, style: cleanStyle as React.CSSProperties | undefined };
      });
      authFetch(`/api/sessions/${sessionId}/canvas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: cleanNodes, edges }),
      }).catch(() => logger.warn('Canvas operation failed'));
    }, 3000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, sessionId, authFetch]);

  // Keep refs in sync for callbacks
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Sync external node/edge changes — only on significant changes (new diagram),
  // not on drags/moves (which just change positions within the same set)
  const prevNodeIdsRef = useRef('');
  const prevEdgeIdsRef = useRef('');
  const knownNodeIds = useRef<Set<string>>(new Set());
  const animCleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diagramAnimatingRef = useRef(false);

  useEffect(() => {
    const nodeIds = initialNodes
      .map((n) => n.id)
      .sort()
      .join(',');
    if (nodeIds !== prevNodeIdsRef.current) {
      prevNodeIdsRef.current = nodeIds;

      // Detect which nodes are NEW (not seen before)
      const currentIds = new Set(initialNodes.map((n) => n.id));
      const newIds = new Set<string>();
      for (const id of currentIds) {
        if (!knownNodeIds.current.has(id)) newIds.add(id);
      }

      if (newIds.size > 0) {
        // Skip animation for user-drawn nodes (freehand, sticky) — they should appear instantly
        const USER_DRAW_TYPES = new Set(['freehand', 'sticky']);
        const diagramNewIds = new Set(
          [...newIds].filter((id) => {
            const n = initialNodes.find((node) => node.id === id);
            return n && !USER_DRAW_TYPES.has(n.type || '');
          }),
        );

        if (diagramNewIds.size > 0) {
          diagramAnimatingRef.current = true;
          // Sort new diagram nodes by Y position for staggered reveal
          const newNodes = initialNodes.filter((n) => diagramNewIds.has(n.id));
          const sorted = [...newNodes].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));
          // Stagger reveal, but cap the total so a large sub-flow batch doesn't
          // produce a multi-second (and janky) entrance — beyond the cap nodes
          // fade in together.
          const STAGGER_MS = 80;
          const STAGGER_CAP_MS = 1200;
          const delayMap = new Map<string, number>();
          sorted.forEach((n, i) => delayMap.set(n.id, Math.min(i * STAGGER_MS, STAGGER_CAP_MS)));

          // Inject animation directly via inline style
          const animated = initialNodes.map((n) => {
            if (!diagramNewIds.has(n.id)) return n;
            const delay = delayMap.get(n.id) || 0;
            return {
              ...n,
              style: {
                ...(n.style || {}),
                opacity: 0,
                animation: `nodeEnter 0.35s ease-out ${delay}ms forwards`,
              },
            };
          });
          setNodes(animated);

          // After all animations complete, strip animation styles. Matches the
          // capped stagger above (+500ms covers the 0.35s fade + buffer).
          const maxDelay = Math.min(sorted.length * STAGGER_MS, STAGGER_CAP_MS) + 500;
          if (animCleanupTimer.current) clearTimeout(animCleanupTimer.current);
          animCleanupTimer.current = setTimeout(() => {
            diagramAnimatingRef.current = false;
            setNodes((nds) =>
              nds.map((n) => {
                if (!diagramNewIds.has(n.id)) return n;
                if (n.style) {
                  const { opacity, animation, animationDelay, ...rest } = n.style as Record<
                    string,
                    unknown
                  >;
                  return {
                    ...n,
                    style: (Object.keys(rest).length > 0 ? rest : undefined) as
                      React.CSSProperties | undefined,
                  };
                }
                return n;
              }),
            );
          }, maxDelay);
        } else {
          // Only user-drawn nodes are new — render immediately, no animation
          setNodes(initialNodes);
        }
      } else {
        setNodes(initialNodes);
      }

      // Update known IDs
      knownNodeIds.current = currentIds;

      // Defer initial snapshot — taken by edge sync after all animations complete

      // FitView only when diagram nodes are added (not freehand/sticky/line)
      const USER_TYPES = new Set(['freehand', 'sticky']);
      const hasDiagramNodes = [...newIds].some((id) => {
        const n = initialNodes.find((node) => node.id === id);
        return n && !USER_TYPES.has(n.type || '');
      });
      if (hasDiagramNodes && initialNodes.length > 0) {
        setTimeout(() => {
          drawerAwareFitView(400);
        }, 150);
      }
    }
  }, [initialNodes, setNodes, drawerAwareFitView]);

  // Sync DATA updates on existing nodes (e.g. _thinking text streamed onto a
  // skeleton, _filled flag flipping when a screen lands). The effect above
  // only runs when node IDs change, so data-only updates wouldn't propagate
  // to React Flow's internal store and the node would render with stale
  // props. This effect keeps each node's data ref in sync.
  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const fresh = initialNodes.find((m) => m.id === n.id);
        if (!fresh) return n;
        if (fresh.data === n.data) return n;
        changed = true;
        return { ...n, data: fresh.data };
      });
      return changed ? next : prev;
    });
  }, [initialNodes, setNodes]);
  const knownEdgeIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const edgeIds = initialEdges
      .map((e) => e.id)
      .sort()
      .join(',');
    if (edgeIds !== prevEdgeIdsRef.current) {
      prevEdgeIdsRef.current = edgeIds;

      // Detect new edges
      const currentEIds = new Set(initialEdges.map((e) => e.id));
      const newEIds = new Set<string>();
      for (const id of currentEIds) {
        if (!knownEdgeIds.current.has(id)) newEIds.add(id);
      }
      // Draw-in animation is only for edges arriving into an ALREADY-populated
      // canvas (live incremental additions). On the initial mount of a
      // restored session — or the first generation batch — there are no prior
      // edges, and the animation path clears edges then re-adds them over the
      // (now much longer, with sub-flows) node-animation window, which left
      // rejoined flows with NO visible connectors. Render those instantly.
      const _hadEdges = knownEdgeIds.current.size > 0;
      knownEdgeIds.current = currentEIds;

      if (newEIds.size > 0 && diagramAnimatingRef.current && _hadEdges) {
        // Diagram edges — stagger with draw-in animation after node animation
        const existingEdges = initialEdges.filter((e) => !newEIds.has(e.id));
        setEdges(existingEdges);

        const nodeAnimDuration = Math.min(initialNodes.length * 80, 1200) + 600;
        const newEdges = initialEdges.filter((e) => newEIds.has(e.id));
        newEdges.forEach((edge, i) => {
          setTimeout(
            () => {
              setEdges((eds) => {
                if (eds.some((e) => e.id === edge.id)) return eds;
                return [...eds, { ...edge, className: 'edge-draw-in' }];
              });
              setTimeout(() => {
                setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, className: '' } : e)));
              }, 700);
            },
            nodeAnimDuration + i * 60,
          );
        });
        // Take initial history snapshot after all animations complete
        const totalAnimMs = nodeAnimDuration + newEdges.length * 60 + 800;
        setTimeout(() => {
          if (historyRef.current.length === 0) {
            historyRef.current = [
              {
                nodes: structuredClone(
                  nodesRef.current.map((n) => ({ ...n, data: stripNonCloneable(n.data) })),
                ),
                edges: structuredClone(edgesRef.current),
              },
            ];
            historyIndexRef.current = 0;
          }
        }, totalAnimMs);
      } else {
        setEdges(initialEdges);
        // Take initial snapshot if no edge animation needed
        if (historyRef.current.length === 0) {
          setTimeout(() => {
            historyRef.current = [
              {
                nodes: structuredClone(
                  nodesRef.current.map((n) => ({ ...n, data: stripNonCloneable(n.data) })),
                ),
                edges: structuredClone(edgesRef.current),
              },
            ];
            historyIndexRef.current = 0;
          }, 300);
        }
      }
    }
  }, [initialEdges, setEdges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape':
          setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
          setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
          setSelectionBounds(null);
          setMode('select');
          break;
        case 'v':
          setMode('select');
          break;
        case 'b':
          setMode('boxSelect');
          break;
        case 'g':
          setMode('lasso');
          break;
        case 'd':
          setMode('draw');
          break;
        case 'l':
          setMode('laser');
          break;
        case 's':
          setMode('sticky');
          break;
        case 'x':
          setMode('line');
          break;
        case 'e':
          setMode('eraser');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
      scheduleSnapshot();
    },
    [onNodesChange, onNodesChangeCallback, scheduleSnapshot],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (onEdgesChangeCallback) {
        setTimeout(() => onEdgesChangeCallback(edgesRef.current), 0);
      }
      scheduleSnapshot();
    },
    [onEdgesChange, onEdgesChangeCallback, scheduleSnapshot],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => {
        const updated = addEdge({ ...connection, type: 'solid' }, eds);
        if (onEdgesChangeCallback) {
          setTimeout(() => onEdgesChangeCallback(updated), 0);
        }
        return updated;
      });
      scheduleSnapshot();
    },
    [setEdges, onEdgesChangeCallback, scheduleSnapshot],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((eds) => {
        const updated = eds.map((e) => {
          if (e.id !== oldEdge.id) return e;
          return {
            ...e,
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
          };
        });
        if (onEdgesChangeCallback) setTimeout(() => onEdgesChangeCallback(updated), 0);
        return updated;
      });
      scheduleSnapshot();
    },
    [setEdges, onEdgesChangeCallback, scheduleSnapshot],
  );

  // Handle freehand path completion: store as a freehand node
  const handleFreehandComplete = useCallback(
    (pathData: string, points: { x: number; y: number }[]) => {
      if (points.length === 0) return;

      // Compute bounding box for node position
      let minX = Infinity;
      let minY = Infinity;
      for (const pt of points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
      }

      // Store points relative to node origin
      const relativePoints = points.map((pt) => ({
        x: pt.x - minX,
        y: pt.y - minY,
      }));

      const nodeId = `freehand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNode: Node = {
        id: nodeId,
        type: 'freehand',
        position: { x: minX, y: minY },
        data: {
          path: pathData,
          points: relativePoints,
          color: 'var(--muted-foreground)',
          width: 2,
        },
        selectable: true,
        draggable: true,
        dragHandle: '.drag-handle__freehand',
      };

      setNodes((nds) => [...nds, newNode]);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
      scheduleSnapshot();
    },
    [setNodes, onNodesChangeCallback, scheduleSnapshot],
  );

  // Handle line completion: store as a freehand node with two points
  const handleLineComplete = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);

      const relativePoints = [
        { x: start.x - minX, y: start.y - minY },
        { x: end.x - minX, y: end.y - minY },
      ];

      const pathData = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

      const nodeId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNode: Node = {
        id: nodeId,
        type: 'freehand',
        position: { x: minX, y: minY },
        data: {
          path: pathData,
          points: relativePoints,
          color: 'var(--muted-foreground)',
          width: 2,
        },
        selectable: true,
        draggable: true,
      };

      setNodes((nds) => [...nds, newNode]);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
      scheduleSnapshot();
    },
    [setNodes, onNodesChangeCallback, scheduleSnapshot],
  );

  // Handle canvas click in sticky mode
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (mode !== 'sticky') return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNode: Node = {
        id: nodeId,
        type: 'sticky',
        position: { x: position.x - 70, y: position.y - 40 }, // center on click
        data: { label: '' },
      };

      setNodes((nds) => [...nds, newNode]);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
      scheduleSnapshot();
    },
    [mode, screenToFlowPosition, setNodes, onNodesChangeCallback, scheduleSnapshot],
  );

  // ── Right-click context menu on nodes ──
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      nodeId: node.id,
      nodeType: node.type || 'unknown',
      nodeData: node.data,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ── Node update handler ──
  const handleNodeUpdate = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n)),
      );
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
    },
    [setNodes, onNodesChangeCallback],
  );

  // ── Node deletion ──
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      // Also remove connected edges
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setContextMenu(null);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
      if (onEdgesChangeCallback) {
        setTimeout(() => onEdgesChangeCallback(edgesRef.current), 0);
      }
    },
    [setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback],
  );

  // ── Node duplication ──
  const handleNodeDuplicate = useCallback(
    (nodeId: string) => {
      const original = nodesRef.current.find((n) => n.id === nodeId);
      if (!original) return;

      const newId = `${original.type || 'node'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const duplicated: Node = {
        ...original,
        id: newId,
        position: {
          x: original.position.x + 40,
          y: original.position.y + 40,
        },
        selected: false,
        data: { ...original.data },
      };

      setNodes((nds) => [...nds, duplicated]);
      setContextMenu(null);
      if (onNodesChangeCallback) {
        setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
      }
    },
    [setNodes, onNodesChangeCallback],
  );

  // ── Inline text editing ──
  const handleEditText = useCallback((nodeId: string) => {
    setContextMenu(null);
    const nodeEl = document.querySelector(`[data-id="${nodeId}"]`);
    if (!nodeEl) return;
    // Focus the first text-like element inside the node
    const textEl = nodeEl.querySelector('textarea, input, [contenteditable]') as HTMLElement;
    if (textEl) {
      textEl.focus();
      if (textEl instanceof HTMLTextAreaElement || textEl instanceof HTMLInputElement) {
        textEl.select();
      }
    }
  }, []);

  // ── Open AI edit modal ──
  const handleOpenAIEdit = useCallback(
    (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => {
      setContextMenu(null);
      const ctx = buildEditContext(nodeId, nodeData, getNodes(), getEdges());
      setAiEdit({
        nodeId,
        nodeType,
        nodeData,
        diagramContext: ctx,
      });
    },
    [getNodes, getEdges],
  );

  const isOverlayMode =
    mode === 'draw' ||
    mode === 'laser' ||
    mode === 'line' ||
    mode === 'eraser' ||
    mode === 'lasso' ||
    mode === 'boxSelect';

  // ── Eraser: delete nodes/edges under cursor while dragging ──
  const eraserActiveRef = useRef(false);
  const erasedIdsRef = useRef<Set<string>>(new Set());
  const [eraserTrail, setEraserTrail] = useState<Array<{ x: number; y: number }>>([]);

  // Point-to-line-segment distance for accurate freehand hit detection
  const distToSegment = useCallback(
    (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax,
        dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    },
    [],
  );

  const eraseAtPosition = useCallback(
    (clientX: number, clientY: number) => {
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      const allNodes = getNodes();
      const toDelete: string[] = [];

      for (const n of allNodes) {
        if (erasedIdsRef.current.has(n.id)) continue;
        const nx = n.position.x;
        const ny = n.position.y;

        if (n.type === 'freehand') {
          // Check distance to actual drawn line segments
          const pts = (n.data as { points?: Array<{ x: number; y: number }> })?.points;
          if (pts && pts.length >= 2) {
            let hit = false;
            for (let i = 0; i < pts.length - 1; i++) {
              const d = distToSegment(
                flowPos.x,
                flowPos.y,
                nx + pts[i].x,
                ny + pts[i].y,
                nx + pts[i + 1].x,
                ny + pts[i + 1].y,
              );
              if (d < 12) {
                hit = true;
                break;
              }
            }
            if (hit) {
              toDelete.push(n.id);
              erasedIdsRef.current.add(n.id);
            }
          }
        } else {
          // Box-based hit for regular nodes
          const w =
            (n.style as { width?: number; height?: number } | undefined)?.width ||
            n.measured?.width ||
            n.width ||
            180;
          const h =
            (n.style as { width?: number; height?: number } | undefined)?.height ||
            n.measured?.height ||
            n.height ||
            60;
          if (flowPos.x >= nx && flowPos.x <= nx + w && flowPos.y >= ny && flowPos.y <= ny + h) {
            toDelete.push(n.id);
            erasedIdsRef.current.add(n.id);
          }
        }
      }

      if (toDelete.length > 0) {
        const deleteSet = new Set(toDelete);
        setNodes((nds) => nds.filter((n) => !deleteSet.has(n.id)));
        setEdges((eds) => eds.filter((e) => !deleteSet.has(e.source) && !deleteSet.has(e.target)));
        if (onNodesChangeCallback) setTimeout(() => onNodesChangeCallback(nodesRef.current), 0);
        if (onEdgesChangeCallback) setTimeout(() => onEdgesChangeCallback(edgesRef.current), 0);
      }
    },
    [
      screenToFlowPosition,
      getNodes,
      setNodes,
      setEdges,
      onNodesChangeCallback,
      onEdgesChangeCallback,
      distToSegment,
    ],
  );

  // Compute bounding box of selected nodes and persist it
  const updateSelectionBounds = useCallback(() => {
    const selected = getNodes().filter((n) => n.selected);
    if (selected.length === 0) {
      setSelectionBounds(null);
      return;
    }
    const pad = 12;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of selected) {
      const w =
        n.measured?.width ??
        (n.style as { width?: number; height?: number } | undefined)?.width ??
        180;
      const h =
        n.measured?.height ??
        (n.style as { width?: number; height?: number } | undefined)?.height ??
        60;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    setSelectionBounds({
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    });
  }, [getNodes]);

  // Box selection — select nodes within rectangle
  const handleBoxSelectComplete = useCallback(
    (topLeft: { x: number; y: number }, bottomRight: { x: number; y: number }) => {
      const allNodes = getNodes();
      const selectedIds = new Set<string>();
      for (const n of allNodes) {
        const w =
          n.measured?.width ??
          (n.style as { width?: number; height?: number } | undefined)?.width ??
          180;
        const h =
          n.measured?.height ??
          (n.style as { width?: number; height?: number } | undefined)?.height ??
          60;
        const nx = n.position.x;
        const ny = n.position.y;
        // Partial overlap — node overlaps with selection box
        if (nx + w > topLeft.x && nx < bottomRight.x && ny + h > topLeft.y && ny < bottomRight.y) {
          selectedIds.add(n.id);
        }
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: selectedIds.has(n.id) })));
      setTimeout(updateSelectionBounds, 50);
    },
    [getNodes, setNodes, updateSelectionBounds],
  );

  // Lasso selection — point-in-polygon test
  const handleLassoComplete = useCallback(
    (polygon: { x: number; y: number }[]) => {
      if (polygon.length < 3) return;
      // Ray-casting point-in-polygon
      const pointInPoly = (px: number, py: number) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i].x,
            yi = polygon[i].y;
          const xj = polygon[j].x,
            yj = polygon[j].y;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
          }
        }
        return inside;
      };
      // Select nodes whose center falls inside the lasso polygon
      const allNodes = getNodes();
      const selectedIds = new Set<string>();
      for (const n of allNodes) {
        const w =
          n.measured?.width ??
          (n.style as { width?: number; height?: number } | undefined)?.width ??
          180;
        const h =
          n.measured?.height ??
          (n.style as { width?: number; height?: number } | undefined)?.height ??
          60;
        const cx = n.position.x + w / 2;
        const cy = n.position.y + h / 2;
        if (pointInPoly(cx, cy)) selectedIds.add(n.id);
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: selectedIds.has(n.id) })));
      setTimeout(updateSelectionBounds, 50);
    },
    [getNodes, setNodes, updateSelectionBounds],
  );

  const handleEraserPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'eraser') return;
      eraserActiveRef.current = true;
      erasedIdsRef.current.clear();
      setEraserTrail([{ x: e.clientX, y: e.clientY }]);
      eraseAtPosition(e.clientX, e.clientY);
    },
    [mode, eraseAtPosition],
  );

  const handleEraserPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'eraser' || !eraserActiveRef.current) return;
      setEraserTrail((prev) => [...prev.slice(-40), { x: e.clientX, y: e.clientY }]);
      eraseAtPosition(e.clientX, e.clientY);
    },
    [mode, eraseAtPosition],
  );

  const handleEraserPointerUp = useCallback(() => {
    if (eraserActiveRef.current) {
      eraserActiveRef.current = false;
      erasedIdsRef.current.clear();
      setEraserTrail([]);
      scheduleSnapshot();
    }
  }, [scheduleSnapshot]);

  return (
    <DiagramViewProvider value={viewMode}>
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          zIndex: 99999,
          background: '#ff0040',
          color: '#fff',
          font: '12px monospace',
          padding: '4px 8px',
          borderRadius: 4,
          pointerEvents: 'none',
        }}
      >
        DBG nodes:{nodes.length} edges:{edges.length}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onSelectionChange={({ nodes: selNodes }) => {
          if (selNodes.length > 0) setTimeout(updateSelectionBounds, 50);
          else setSelectionBounds(null);
        }}
        onEdgeClick={(_event, edge) => {
          setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
        }}
        onNodeMouseEnter={(_, node) => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = setTimeout(() => setHoveredNodeId(node.id), 200);
        }}
        onNodeMouseLeave={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = setTimeout(() => setHoveredNodeId(null), 300);
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={colorScheme}
        connectionMode={ConnectionMode.Loose}
        edgesReconnectable
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[20, 20]}
        fitView={false}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'solid',
          selectable: true,
        }}
        panOnDrag={!isOverlayMode}
        selectionOnDrag={false}
        zoomOnScroll={!isOverlayMode}
        zoomOnPinch={!isOverlayMode}
        zoomOnDoubleClick={!isOverlayMode}
        selectNodesOnDrag={false}
        nodesDraggable={mode === 'select'}
        nodeDragThreshold={5}
        nodesConnectable={mode === 'select'}
        elementsSelectable={mode === 'select' || mode === 'boxSelect' || mode === 'lasso'}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          color="var(--canvas-grid)"
          bgColor="var(--canvas-bg)"
        />
        {nodes.length > 0 && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={{
              width: 160,
              height: 110,
              background: 'rgba(12,12,12,0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              backdropFilter: 'blur(16px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
            maskColor="rgba(0,0,0,0.55)"
            maskStrokeColor="rgba(229,166,48,0.35)"
            maskStrokeWidth={1.5}
            nodeColor={(n) => {
              if (n.type === 'zone') return 'color-mix(in srgb, var(--foreground) 4%, transparent)';
              if (n.type === 'decision') return 'rgba(229,166,48,0.5)';
              if (n.type === 'annotation' || n.type === 'freehand') return 'transparent';
              return 'var(--muted-foreground)';
            }}
            nodeBorderRadius={3}
            nodeStrokeWidth={0}
          />
        )}
        <Panel position="top-center">
          <CanvasToolbar
            mode={mode}
            onModeChange={setMode}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onClear={() => {
              setClearSignal((s) => s + 1);
              setNodes((ns) =>
                ns.filter(
                  (n) => n.type !== 'freehand' && n.type !== 'sticky' && n.type !== 'annotation',
                ),
              );
            }}
            fullscreen={fullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </Panel>
        {(onClearCanvas || onClearChat) && (
          <Panel position="top-right" style={{ display: 'flex', gap: 6 }}>
            {onClearChat && (
              <button
                onClick={onClearChat}
                title="Clear chat history"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 9999,
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--muted-foreground)',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,100,100,0.4)';
                  e.currentTarget.style.color = 'rgba(255,100,100,0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    'color-mix(in srgb, var(--foreground) 8%, transparent)';
                  e.currentTarget.style.color = 'var(--muted-foreground)';
                }}
              >
                <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Clear Chat
              </button>
            )}
            {onClearCanvas && (
              <button
                onClick={onClearCanvas}
                title="Clear all diagram nodes"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 9999,
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--muted-foreground)',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,100,100,0.4)';
                  e.currentTarget.style.color = 'rgba(255,100,100,0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    'color-mix(in srgb, var(--foreground) 8%, transparent)';
                  e.currentTarget.style.color = 'var(--muted-foreground)';
                }}
              >
                <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Clear Canvas
              </button>
            )}
          </Panel>
        )}
      </ReactFlow>

      <FreehandLayer
        mode={mode}
        onFreehandComplete={handleFreehandComplete}
        onLineComplete={handleLineComplete}
        onLassoComplete={handleLassoComplete}
        onBoxSelectComplete={handleBoxSelectComplete}
        clearSignal={clearSignal}
      />

      {/* Eraser overlay with trail */}
      {mode === 'eraser' && (
        <div
          style={{ position: 'absolute', inset: 0, cursor: 'none', zIndex: 10 }}
          onPointerDown={handleEraserPointerDown}
          onPointerMove={(e) => {
            handleEraserPointerMove(e);
            // Update cursor position even when not erasing
            if (!eraserActiveRef.current) setEraserTrail([{ x: e.clientX, y: e.clientY }]);
          }}
          onPointerUp={handleEraserPointerUp}
          onPointerLeave={(e) => {
            handleEraserPointerUp();
            setEraserTrail([]);
          }}
        >
          {/* Eraser cursor + trail */}
          <svg
            style={{
              position: 'fixed',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {eraserTrail.length > 1 && (
              <path
                d={`M ${eraserTrail.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                fill="none"
                stroke="rgba(255,100,100,0.4)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {eraserTrail.length > 0 && (
              <circle
                cx={eraserTrail[eraserTrail.length - 1].x}
                cy={eraserTrail[eraserTrail.length - 1].y}
                r="8"
                fill="none"
                stroke="rgba(255,100,100,0.6)"
                strokeWidth="1.5"
              />
            )}
          </svg>
        </div>
      )}

      {/* Hover menu removed — the floating sparkle button was visually
          intrusive on wireframes. Same actions still available via the
          right-click context menu. */}

      {/* Context menu on right-click */}
      {contextMenu && (
        <ElementContextMenu
          nodeId={contextMenu.nodeId}
          nodeType={contextMenu.nodeType}
          nodeData={contextMenu.nodeData}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onUpdate={handleNodeUpdate}
          onEditWithAI={() =>
            handleOpenAIEdit(contextMenu.nodeId, contextMenu.nodeType, contextMenu.nodeData)
          }
          onDuplicate={() => handleNodeDuplicate(contextMenu.nodeId)}
          onDelete={() => handleNodeDelete(contextMenu.nodeId)}
          onEditText={() => handleEditText(contextMenu.nodeId)}
        />
      )}

      {/* AI edit modal */}
      {aiEdit && sessionId && (
        <AIEditModal
          nodeId={aiEdit.nodeId}
          nodeType={aiEdit.nodeType}
          nodeData={aiEdit.nodeData}
          diagramContext={aiEdit.diagramContext}
          onClose={() => setAiEdit(null)}
          onUpdate={(nodeId, newData) => {
            handleNodeUpdate(nodeId, newData);
            setAiEdit(null);
          }}
          sessionId={sessionId}
          fetchFn={authFetch}
        />
      )}
    </DiagramViewProvider>
  );
}

/** Wrapper that provides the ReactFlowProvider context required by the inner component. */
export default function CanvasEngine({
  initialNodes = [],
  initialEdges = [],
  onNodesChange,
  onEdgesChange,
  sessionId,
  authFetch,
  className,
  onClearCanvas,
  onClearChat,
  chatOpen,
  blueprintOpen,
  fullscreen,
  onToggleFullscreen,
}: CanvasEngineProps) {
  return (
    <div
      className={className}
      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--canvas-bg)',
        border: '1px solid transparent',
      }}
    >
      <style>{`
        @keyframes nodeEnter { from { opacity: 0; } to { opacity: 1; } }

        /* Ethereal loading border — ::after always present, opacity controlled by class */
        .canvas-ai-thinking-wrap {
          border-radius: 12px;
          position: relative;
        }
        .canvas-ai-thinking-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 12px;
          pointer-events: none;
          z-index: 50;
          border: 1px solid transparent;
          box-shadow: none;
          opacity: 0;
          transition: opacity 0.3s ease-out;
          animation: none;
        }
        .canvas-ai-thinking-wrap.canvas-ai-thinking::after {
          opacity: 1;
          animation: ethereal-border 4s ease-in-out infinite;
        }
        .canvas-ai-thinking-wrap.canvas-ai-fading::after {
          opacity: 0;
          transition: opacity 2s ease-out;
          animation: ethereal-border 4s ease-in-out infinite;
        }
        @keyframes ethereal-border {
          0%, 100% {
            border-color: color-mix(in srgb, var(--primary) 15%, transparent);
            box-shadow:
              inset 0 0 20px 3px color-mix(in srgb, var(--primary) 2%, transparent),
              inset 0 0 60px 15px color-mix(in srgb, var(--primary) 1%, transparent);
          }
          50% {
            border-color: color-mix(in srgb, var(--primary) 50%, transparent);
            box-shadow:
              inset 0 0 35px 6px color-mix(in srgb, var(--primary) 5%, transparent),
              inset 0 0 90px 25px color-mix(in srgb, var(--primary) 2%, transparent);
          }
        }
      `}</style>
      <ReactFlowProvider>
        <CanvasEngineInner
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          sessionId={sessionId}
          authFetch={authFetch}
          onClearCanvas={onClearCanvas}
          onClearChat={onClearChat}
          chatOpen={chatOpen}
          blueprintOpen={blueprintOpen}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      </ReactFlowProvider>
    </div>
  );
}
