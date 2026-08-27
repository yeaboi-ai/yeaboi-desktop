import type { LayoutOptions } from 'elkjs/lib/elk.bundled';

// --------------------------------------------------------------------------
// Diagram types
// --------------------------------------------------------------------------

export type DiagramType = 'architecture' | 'erd' | 'flow' | 'wireframe';

// --------------------------------------------------------------------------
// Default node dimensions (used when the node carries no explicit size)
// --------------------------------------------------------------------------

export const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  service:    { width: 280, height: 80  },
  zone:       { width: 100, height: 80 },  // minimum — ELK grows to fit children
  database:   { width: 280, height: 200 },
  process:    { width: 220, height: 70  },
  decision:   { width: 140, height: 140 },
  swimlane:   { width: 400, height: 600 },
  wirescreen: { width: 390, height: 844 },
  sticky:     { width: 200, height: 150 },
  annotation: { width: 200, height: 40  },
  inventory: { width: 500, height: 300 },
};

// --------------------------------------------------------------------------
// ELK layout presets per diagram type
// --------------------------------------------------------------------------

export const LAYOUT_PRESETS: Record<DiagramType, LayoutOptions> = {
  architecture: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.layered.spacing.nodeNodeBetweenLayers': '300',
    'elk.spacing.nodeNode': '80',
    'elk.spacing.componentComponent': '250',
    'elk.spacing.edgeEdge': '20',
    'elk.layered.spacing.edgeNodeBetweenLayers': '50',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.mergeEdges': 'true',
    'elk.padding': '[top=60,left=50,bottom=50,right=50]',
  },
  erd: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.layered.spacing.nodeNodeBetweenLayers': '120',
    'elk.spacing.nodeNode': '40',
    'elk.portConstraints': 'FIXED_ORDER',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
  },
  flow: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '80',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    'elk.spacing.edgeEdge': '25',
    'elk.separateConnectedComponents': 'true',
    'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
    'elk.layered.layering.strategy': 'LONGEST_PATH',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.edgeRouting': 'SPLINES',
    'elk.layered.mergeEdges': 'false',
    'elk.nodeLabels.placement': 'INSIDE V_CENTER H_CENTER',
    'elk.padding': '[top=40,left=60,bottom=40,right=60]',
  },
  wireframe: {
    'elk.algorithm': 'box',
    'elk.spacing.nodeNode': '80',
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
  },
};
