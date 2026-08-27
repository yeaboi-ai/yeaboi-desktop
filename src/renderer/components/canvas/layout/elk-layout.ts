import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled';
import type { Node, Edge } from '@xyflow/react';
import { LAYOUT_PRESETS, NODE_DIMENSIONS, type DiagramType } from './presets';

// --------------------------------------------------------------------------
// Singleton ELK instance
// --------------------------------------------------------------------------

const elk = new ELK();

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function getNodeDimensions(node: Node): { width: number; height: number } {
  const sw = (node.style as any)?.width;
  const sh = (node.style as any)?.height;
  if (typeof sw === 'number' && typeof sh === 'number' && sw > 0 && sh > 0) {
    return { width: sw, height: sh };
  }
  const dw = (node.data as any)?.width;
  const dh = (node.data as any)?.height;
  if (typeof dw === 'number' && typeof dh === 'number' && dw > 0 && dh > 0) {
    return { width: dw, height: dh };
  }
  if (node.measured?.width && node.measured?.height) {
    return { width: node.measured.width, height: node.measured.height };
  }
  if (node.width && node.height) {
    return { width: node.width, height: node.height };
  }
  const preset = NODE_DIMENSIONS[node.type ?? ''];
  if (preset) return preset;
  return { width: 180, height: 60 };
}

/**
 * Build a tree of ELK nodes that mirrors the parent/child relationships
 * expressed via React Flow's `parentId` field. Top-level nodes (no parent)
 * live at the root of the returned array.
 */
function buildElkHierarchy(
  nodes: Node[],
  layoutOptions: Record<string, string>,
): ElkNode[] {
  // Index children by parentId
  const childrenByParent = new Map<string, Node[]>();
  const topLevel: Node[] = [];

  for (const node of nodes) {
    if (node.parentId) {
      const siblings = childrenByParent.get(node.parentId) ?? [];
      siblings.push(node);
      childrenByParent.set(node.parentId, siblings);
    } else {
      topLevel.push(node);
    }
  }

  function toElkNode(n: Node): ElkNode {
    const { width, height } = getNodeDimensions(n);
    const children = childrenByParent.get(n.id);

    const elkNode: ElkNode = {
      id: n.id,
      width,
      height,
      // Compound nodes (zones) inherit parent flow direction with internal spacing
      ...(children
        ? {
            children: children.map(toElkNode),
            layoutOptions: {
              'elk.algorithm': 'layered',
              'elk.direction': layoutOptions['elk.direction'] || 'RIGHT',
              'elk.spacing.nodeNode': '50',
              'elk.spacing.edgeNode': '40',
              'elk.layered.spacing.nodeNodeBetweenLayers': '120',
              'elk.layered.spacing.edgeNodeBetweenLayers': '40',
              'elk.padding': '[top=44,left=24,bottom=24,right=24]',
              'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
            },
          }
        : {}),
    };

    return elkNode;
  }

  return topLevel.map(toElkNode);
}

/**
 * After ELK finishes, we need to walk the result tree and map positions
 * back onto the React Flow nodes.
 *
 * ELK returns absolute coordinates for every node including children.
 * React Flow expects child positions to be *relative* to their parent, so
 * we subtract the parent's absolute position for nested nodes.
 */
function collectPositions(
  elkNode: ElkNode,
  parentAbsX: number,
  parentAbsY: number,
  out: Map<string, { x: number; y: number }>,
): void {
  const absX = (elkNode.x ?? 0) + parentAbsX;
  const absY = (elkNode.y ?? 0) + parentAbsY;

  // For children, store position relative to parent
  out.set(elkNode.id, {
    x: elkNode.x ?? 0,
    y: elkNode.y ?? 0,
  });

  if (elkNode.children) {
    for (const child of elkNode.children) {
      collectPositions(child, absX, absY, out);
    }
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Run ELK layout on a set of React Flow nodes and edges and return the
 * nodes with updated positions plus the original edges (ELK doesn't
 * normally move edge waypoints — React Flow's edge router handles that).
 */
export async function layoutDiagram(
  nodes: Node[],
  edges: Edge[],
  type: DiagramType,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) {
    return { nodes: [], edges };
  }

  const layoutOptions = LAYOUT_PRESETS[type] as Record<string, string>;

  // Build the ELK graph -------------------------------------------------

  const elkChildren = buildElkHierarchy(nodes, layoutOptions);

  const elkEdges: ElkExtendedEdge[] = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: { ...layoutOptions },
    children: elkChildren,
    edges: elkEdges,
  };

  // Run ELK layout (async) -----------------------------------------------

  const result = await elk.layout(elkGraph);

  // Map positions back to React Flow nodes --------------------------------

  const positionMap = new Map<string, { x: number; y: number }>();

  if (result.children) {
    for (const topNode of result.children) {
      collectPositions(topNode, 0, 0, positionMap);
    }
  }

  // Also update parent nodes with the dimensions ELK computed for them
  // (compound nodes grow to fit their children).
  const dimensionMap = new Map<string, { width: number; height: number }>();
  function collectDimensions(elkNode: ElkNode): void {
    if (elkNode.width != null && elkNode.height != null) {
      dimensionMap.set(elkNode.id, {
        width: elkNode.width,
        height: elkNode.height,
      });
    }
    if (elkNode.children) {
      for (const child of elkNode.children) {
        collectDimensions(child);
      }
    }
  }
  if (result.children) {
    for (const topNode of result.children) {
      collectDimensions(topNode);
    }
  }

  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    const dim = dimensionMap.get(node.id);

    return {
      ...node,
      position: pos ?? node.position,
      // Constrain children inside their parent zone
      ...(node.parentId ? { extent: 'parent' as const } : {}),
      ...(dim
        ? {
            style: {
              ...(node.style ?? {}),
              width: dim.width,
              height: dim.height,
            },
          }
        : {}),
    };
  });

  // Assign handles by diagram flow direction.
  const isHorizontalFlow = type === 'architecture' || type === 'erd' || type === 'wireframe';
  const isVerticalFlow = type === 'flow';

  let layoutedEdges = edges.map((edge) => {
    if (isHorizontalFlow) {
      return { ...edge, sourceHandle: 'right', targetHandle: 'left' };
    }
    return { ...edge, sourceHandle: 'bottom', targetHandle: 'top' };
  });

  // For flow diagrams: remove backward edges (source below target)
  if (isVerticalFlow) {
    const posMap = new Map(layoutedNodes.map(n => [n.id, n.position]));
    layoutedEdges = layoutedEdges.filter(e => {
      const sp = posMap.get(e.source);
      const tp = posMap.get(e.target);
      if (!sp || !tp) return true;
      return sp.y <= tp.y;
    });
  }

  // For flow diagrams: reposition disconnected sub-flows to the right
  if (isVerticalFlow && layoutedNodes.length > 1) {
    // Find connected components
    const nodeIds = new Set(layoutedNodes.map(n => n.id));
    const adj = new Map<string, Set<string>>();
    for (const id of nodeIds) adj.set(id, new Set());
    for (const e of layoutedEdges) {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.add(e.target);
        adj.get(e.target)!.add(e.source);
      }
    }
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const id of nodeIds) {
      if (visited.has(id)) continue;
      const comp: string[] = [];
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        comp.push(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!visited.has(nb)) stack.push(nb);
        }
      }
      components.push(comp);
    }

    if (components.length > 1) {
      // Main flow = largest component; rest are sub-flows
      components.sort((a, b) => b.length - a.length);
      const mainIds = new Set(components[0]);

      // Build a map: sub-flow node ID → parent node label (from subflowIds)
      const subflowParentLabel = new Map<string, string>();
      for (const n of layoutedNodes) {
        const sfIds = (n.data as any)?.subflowIds as string[] | undefined;
        if (sfIds?.length) {
          for (const sid of sfIds) {
            subflowParentLabel.set(sid, (n.data as any)?.label ?? 'Sub-flow');
          }
        }
      }

      // Compute main flow bounding box
      let mainMaxX = -Infinity;
      for (const n of layoutedNodes) {
        if (!mainIds.has(n.id)) continue;
        const w = (n.style as any)?.width ?? getNodeDimensions(n).width;
        mainMaxX = Math.max(mainMaxX, n.position.x + w);
      }
      const mainMinY = Math.min(...layoutedNodes.filter(n => mainIds.has(n.id)).map(n => n.position.y));

      // Shift each sub-flow component to the right and add title
      const SUB_GAP = 200;
      const TITLE_OFFSET = 50;
      let curX = mainMaxX + SUB_GAP;
      for (let c = 1; c < components.length; c++) {
        const compIds = new Set(components[c]);
        const compNodes = layoutedNodes.filter(n => compIds.has(n.id));
        const compMinX = Math.min(...compNodes.map(n => n.position.x));
        const compMinY = Math.min(...compNodes.map(n => n.position.y));
        const compMaxX = Math.max(...compNodes.map(n => n.position.x + ((n.style as any)?.width ?? getNodeDimensions(n).width)));
        const shiftX = curX - compMinX;
        const shiftY = mainMinY - compMinY;
        for (const n of layoutedNodes) {
          if (!compIds.has(n.id)) continue;
          n.position = { x: n.position.x + shiftX, y: n.position.y + shiftY };
        }

        // Derive title from parent node label
        let title = 'Sub-flow';
        for (const id of compIds) {
          if (subflowParentLabel.has(id)) {
            title = subflowParentLabel.get(id)!;
            break;
          }
        }

        // Add annotation node as title above the sub-flow
        const titleId = `_subflow-title-${title.toLowerCase().replace(/\s+/g, '-')}-${c}`;
        layoutedNodes.push({
          id: titleId,
          type: 'annotation',
          position: { x: curX, y: mainMinY - TITLE_OFFSET },
          selectable: false,
          draggable: false,
          data: {
            label: title.toUpperCase(),
            fontSize: 18,
            color: 'var(--muted-foreground)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            _zoneType: 'flow',
            _isSubflowHeader: true,
          },
        } as Node);

        curX += (compMaxX - compMinX) + SUB_GAP;
      }
    }
  }

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
