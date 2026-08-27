// The session canvas' state: nodes/edges, their load order, and the WS
// events that redraw them.
//
// Load order mirrors the web app: the saved canvas (PUT by CanvasEngine's
// autosave) wins when it exists — it holds hand-moved positions; otherwise
// the stored diagram state re-parses through the same parser the live
// events use. Live diagram_update events replace the nodes of their own
// zone (_zoneType) and leave every other zone where it stands. That is a
// simplification of the web page's per-zone banding (which preserves
// skeleton fill-in and wirescreen positions across partial updates) — good
// for whole-diagram redraws, revisit if partial wireframe streams jostle.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { parseDiagram } from '@/components/canvas/ai/diagram-parser';
import type { DiagramData } from '@/components/canvas/ai/diagram-schema';
import { layoutDiagram } from '@/components/canvas/layout/elk-layout';
import { logger } from '@/lib/logger';

interface WsEvent {
  type: string;
  payload?: unknown;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseAndLayout(diagram: DiagramData): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const parsed = parseDiagram(diagram);
  try {
    const laid = await layoutDiagram(parsed.nodes, parsed.edges, diagram.type);
    return { nodes: laid.nodes, edges: laid.edges };
  } catch {
    // ELK refused — a simple grid beats an empty canvas.
    const cols = Math.ceil(Math.sqrt(parsed.nodes.length || 1));
    return {
      nodes: parsed.nodes.map((node, i) => ({
        ...node,
        position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 160 },
      })),
      edges: parsed.edges,
    };
  }
}

function stampZone(nodes: Node[], zone: string): Node[] {
  return nodes.map((node) => ({ ...node, data: { ...node.data, _zoneType: zone } }));
}

export function useCanvasState({
  sessionId,
  authFetch,
  ready,
  events,
}: {
  sessionId: string;
  authFetch: AuthFetch;
  ready: boolean;
  events: WsEvent[];
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [generating, setGenerating] = useState(false);
  const [thinking, setThinking] = useState(false);
  // Remount CanvasEngine when a whole new document arrives — its node state
  // is seeded from initialNodes, so replacing content needs a new instance.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const cursor = useRef(0);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDiagram = useCallback(async (diagram: DiagramData) => {
    const zone = String(diagram.type ?? '');
    if (!zone) return;
    const { nodes: zoneNodes, edges: zoneEdges } = await parseAndLayout(diagram);
    const stamped = stampZone(zoneNodes, zone);
    setNodes((prior) => {
      const kept = prior.filter(
        (node) => (node.data as { _zoneType?: string })?._zoneType !== zone,
      );
      // New zones land to the right of what exists, so two zones never overlap.
      let offsetX = 0;
      for (const node of kept) {
        const width = Number((node.style as { width?: number })?.width ?? 260);
        offsetX = Math.max(offsetX, (node.position?.x ?? 0) + width + 160);
      }
      const shifted = kept.length
        ? stamped.map((node) =>
            node.parentId
              ? node
              : {
                  ...node,
                  position: { x: (node.position?.x ?? 0) + offsetX, y: node.position?.y ?? 0 },
                },
          )
        : stamped;
      return [...kept, ...shifted];
    });
    setEdges((prior) => {
      const keptIds = new Set(zoneEdges.map((edge) => edge.id));
      return [...prior.filter((edge) => !keptIds.has(edge.id)), ...zoneEdges];
    });
    setCanvasEpoch((epoch) => epoch + 1);
  }, []);

  // Initial load: saved canvas first, else re-parse the stored diagram state.
  useEffect(() => {
    if (!ready || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const canvasResp = await authFetch(`/api/sessions/${sessionId}/canvas`);
        if (canvasResp.ok) {
          const saved = (await canvasResp.json()) as { nodes?: Node[]; edges?: Edge[] } | null;
          if (!cancelled && saved?.nodes?.length) {
            setNodes(saved.nodes);
            setEdges(saved.edges ?? []);
            setCanvasEpoch((epoch) => epoch + 1);
            return;
          }
        }
        const diagramResp = await authFetch(`/api/sessions/${sessionId}/diagram`);
        if (diagramResp.ok) {
          const state = (await diagramResp.json()) as Record<string, unknown> | null;
          if (cancelled || !state) return;
          // Stored either as one diagram (legacy, `type` at root) or a dict
          // keyed by diagram type.
          const diagrams: DiagramData[] = state['type']
            ? [state as unknown as DiagramData]
            : (Object.values(state).filter(
                (value) => value && typeof value === 'object' && (value as DiagramData).type,
              ) as DiagramData[]);
          for (const diagram of diagrams) await applyDiagram(diagram);
        }
      } catch (error) {
        logger.warn('canvas load failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId]);

  // Live events. Same cursor pattern as use-session-events.
  useEffect(() => {
    const total = events.length;
    let start = cursor.current;
    if (start > total) start = 0;
    if (start >= total) return;
    cursor.current = total;
    for (const event of events.slice(start)) {
      if (!event) continue;
      switch (event.type) {
        case 'diagram_update': {
          setGenerating(false);
          const payload = event.payload as DiagramData | undefined;
          if (payload?.type) void applyDiagram(payload);
          break;
        }
        case 'diagram_generating':
          setGenerating(true);
          break;
        case 'screen_thinking':
        case 'ai_speaking': {
          setThinking(true);
          if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
          thinkingTimer.current = setTimeout(() => setThinking(false), 4000);
          break;
        }
        default:
          break;
      }
    }
  }, [events, applyDiagram]);

  const clear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCanvasEpoch((epoch) => epoch + 1);
    authFetch(`/api/sessions/${sessionId}/canvas`, { method: 'DELETE' }).catch(() => {});
    authFetch(`/api/sessions/${sessionId}/diagram`, { method: 'DELETE' }).catch(() => {});
  }, [authFetch, sessionId]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    generating,
    thinking,
    canvasEpoch,
    clear,
  };
}
