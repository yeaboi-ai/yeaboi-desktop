import type { Node, Edge } from '@xyflow/react';
import { getIconUrl } from '../icons/icon-registry';
import { NODE_DIMENSIONS } from '../layout/presets';
import type {
  DiagramData,
  ArchitectureDiagram,
  ERDDiagram,
  FlowchartDiagram,
  WireframeDiagram,
} from './diagram-schema';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

let edgeCounter = 0;
let edgePrefix = '';
function nextEdgeId(): string {
  return `e-${edgePrefix}-${++edgeCounter}`;
}

/** Placeholder position — overridden by ELK layout. */
const DEFAULT_POS = { x: 0, y: 0 };

// --------------------------------------------------------------------------
// Architecture parser
// --------------------------------------------------------------------------

function parseArchitecture(diagram: ArchitectureDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build a lookup of nodeId -> zoneId from both node.zoneId AND zone.children
  const nodeZoneMap = new Map<string, string>();
  for (const zone of diagram.zones || []) {
    if (Array.isArray((zone as any).children)) {
      for (const childId of (zone as any).children) {
        nodeZoneMap.set(childId, zone.id);
      }
    }
  }
  for (const n of diagram.nodes) {
    if (n.zoneId) nodeZoneMap.set(n.id, n.zoneId);
  }

  // Zones become parent group nodes
  for (const zone of diagram.zones || []) {
    nodes.push({
      id: zone.id,
      type: 'zone',
      position: DEFAULT_POS,
      data: {
        label: zone.label || (zone as any).name || zone.id,
        borderStyle: zone.style || 'dashed',
        color: zone.color,
      },
      ...(zone.parentId ? { parentId: zone.parentId } : {}),
      // Don't set fixed width/height — ELK computes zone size from children
    });
  }

  // Service nodes
  for (const n of diagram.nodes) {
    const iconUrl = n.service ? getIconUrl(n.service, n.provider) : null;

    nodes.push({
      id: n.id,
      type: 'service',
      position: DEFAULT_POS,
      data: {
        label: n.label,
        service: n.service,
        provider: n.provider ?? 'generic',
        iconUrl,
        description: n.description,
      },
      ...(n.zoneId || nodeZoneMap.get(n.id) ? { parentId: n.zoneId || nodeZoneMap.get(n.id) } : {}),
      style: {
        width: NODE_DIMENSIONS.service.width,
        height: NODE_DIMENSIONS.service.height,
      },
    });
  }

  // Edges
  for (const e of diagram.edges) {
    edges.push({
      id: nextEdgeId(),
      source: e.from,
      target: e.to,
      label: e.label,
      type: e.style === 'animated' ? 'animated' : (e.style ?? 'solid'),
      animated: e.style === 'animated',
      style: e.style === 'dashed' ? { strokeDasharray: '6 3' } : undefined,
    });
  }

  return { nodes, edges };
}

// --------------------------------------------------------------------------
// ERD parser
// --------------------------------------------------------------------------

function parseERD(diagram: ERDDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const table of diagram.tables) {
    nodes.push({
      id: table.id,
      type: 'database',
      position: DEFAULT_POS,
      data: {
        label: table.name,
        columns: table.columns,
      },
      style: {
        width: NODE_DIMENSIONS.database.width,
        height: NODE_DIMENSIONS.database.height,
      },
    });
  }

  for (const rel of diagram.relationships) {
    // Determine the label suffix based on cardinality
    const cardinalityLabel = {
      'one-to-one': '1:1',
      'one-to-many': '1:N',
      'many-to-many': 'N:M',
    }[rel.type];

    const label = rel.label ? `${rel.label} (${cardinalityLabel})` : cardinalityLabel;

    edges.push({
      id: nextEdgeId(),
      source: rel.from,
      target: rel.to,
      type: 'relationship',
      label,
      data: { relationshipType: rel.type },
    });
  }

  return { nodes, edges };
}

// --------------------------------------------------------------------------
// Flowchart parser
// --------------------------------------------------------------------------

/** Map AI schema shapes to React Flow node types */
const FLOW_SHAPE_MAP: Record<string, string> = {
  process: 'process',
  decision: 'decision',
  start: 'process',
  end: 'process',
  io: 'process',
  database: 'database',
  subprocess: 'process',
};

function parseFlow(diagram: FlowchartDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Swim lanes as parent groups
  if (diagram.swimLanes) {
    for (const lane of diagram.swimLanes) {
      nodes.push({
        id: lane.id,
        type: 'swimlane',
        position: DEFAULT_POS,
        data: {
          label: lane.label,
          color: lane.color,
        },
        style: {
          width: NODE_DIMENSIONS.swimlane.width,
          height: NODE_DIMENSIONS.swimlane.height,
        },
      });
    }
  }

  for (const n of diagram.nodes) {
    const nodeType = FLOW_SHAPE_MAP[n.shape] ?? 'process';
    const dims = NODE_DIMENSIONS[nodeType] ?? NODE_DIMENSIONS.process;

    // Start/end nodes get rounded styling; decisions get diamond styling
    const isTerminal = n.shape === 'start' || n.shape === 'end';

    nodes.push({
      id: n.id,
      type: nodeType,
      position: DEFAULT_POS,
      data: {
        label: n.label,
        shape: n.shape,
        isTerminal,
        ...(n.subflowIds?.length ? { subflowIds: n.subflowIds } : {}),
        ...(n.screenId ? { screenId: n.screenId } : {}),
        ...(n.technical ? { technical: n.technical } : {}),
      },
      ...(n.laneId ? { parentId: n.laneId } : {}),
    });
  }

  for (const e of diagram.edges) {
    edges.push({
      id: nextEdgeId(),
      source: e.from,
      target: e.to,
      label: e.label,
      type: e.style ?? 'solid',
      style: e.style === 'dashed' ? { strokeDasharray: '6 3' } : undefined,
    });
  }

  return { nodes, edges };
}

// --------------------------------------------------------------------------
// Wireframe parser
// --------------------------------------------------------------------------

const DEVICE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

function parseWireframe(diagram: WireframeDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Dedupe screens by id — React keys must be unique, and the AI occasionally
  // emits the same screen twice.
  const seenIds = new Set<string>();
  for (const screen of diagram.screens) {
    if (!screen.id || seenIds.has(screen.id)) continue;
    seenIds.add(screen.id);
    // Kind-aware sizing: modals/drawers/popovers don't follow the device
    // dimensions — they're standalone overlay components.
    const kind = ((screen as any).kind as string | undefined) || 'screen';
    const dev = screen.device || 'desktop';
    let w: number;
    let h: number;
    if (kind === 'modal') {
      w = dev === 'mobile' ? 340 : dev === 'tablet' ? 560 : 640;
      h = dev === 'mobile' ? 480 : dev === 'tablet' ? 600 : 480;
    } else if (kind === 'drawer') {
      w = dev === 'mobile' ? 320 : dev === 'tablet' ? 380 : 420;
      h = dev === 'mobile' ? 844 : dev === 'tablet' ? 1180 : 900;
    } else if (kind === 'popover') {
      w = dev === 'mobile' ? 240 : dev === 'tablet' ? 280 : 320;
      h = dev === 'mobile' ? 200 : dev === 'tablet' ? 240 : 280;
    } else {
      const dims = DEVICE_DIMENSIONS[screen.device] ?? DEVICE_DIMENSIONS.mobile;
      w = dims.width;
      h = dims.height;
    }

    nodes.push({
      id: screen.id,
      type: 'wirescreen',
      position: DEFAULT_POS,
      data: {
        label: screen.name,
        device: screen.device,
        kind,
        triggerFrom: (screen as any).trigger_from,
        width: w,
        height: h,
        elements: screen.elements || [],
        html: (screen as any).html,
        fidelity: diagram.fidelity,
      },
      style: {
        width: w,
        height: h,
      },
    });
  }

  // Screen-to-screen navigation flows — only if both screens exist
  const screenIds = new Set(diagram.screens.map((s) => s.id));
  if (diagram.flows) {
    for (const flow of diagram.flows) {
      if (!screenIds.has(flow.from) || !screenIds.has(flow.to)) continue;
      edges.push({
        id: nextEdgeId(),
        source: flow.from,
        target: flow.to,
        label: flow.trigger,
        type: 'solid',
        animated: true,
      });
    }
  }

  return { nodes, edges };
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Convert an AI-generated diagram schema into React Flow nodes and edges.
 *
 * Positions default to (0, 0) — call `layoutDiagram()` from the ELK
 * layout module afterwards to compute proper positions.
 */
export function parseDiagram(diagram: DiagramData): { nodes: Node[]; edges: Edge[] } {
  // Reset the edge counter so IDs are deterministic per parse call
  edgeCounter = 0;
  edgePrefix = diagram.type;

  switch (diagram.type) {
    case 'architecture':
      return parseArchitecture(diagram);
    case 'erd':
      return parseERD(diagram);
    case 'flow':
      return parseFlow(diagram);
    case 'wireframe':
      return parseWireframe(diagram);
    default: {
      // Exhaustiveness check — if a new type is added to DiagramData but
      // not handled here, TypeScript will error.
      const _exhaustive: never = diagram;
      throw new Error(`Unknown diagram type: ${(_exhaustive as DiagramData).type}`);
    }
  }
}
