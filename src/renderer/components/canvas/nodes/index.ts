import type { NodeTypes } from '@xyflow/react';
import { ServiceNode } from './ServiceNode';
import { ZoneNode } from './ZoneNode';
import { DatabaseNode } from './DatabaseNode';
import { ProcessNode } from './ProcessNode';
import { DecisionNode } from './DecisionNode';
import { SwimlaneNode } from './SwimlaneNode';
import { WireScreenNode } from './WireScreenNode';
import { WireButtonNode } from './WireButtonNode';
import { WireInputNode } from './WireInputNode';
import { WireCardNode } from './WireCardNode';
import { WireNavNode } from './WireNavNode';
import { WireTextNode } from './WireTextNode';
import { WireImageNode } from './WireImageNode';
import { AnnotationNode } from './AnnotationNode';
import { StickyNode } from './StickyNode';
import { FreehandNode } from './FreehandNode';
import { InventoryNode } from './InventoryNode';
import { WireframePlanNode } from './WireframePlanNode';

export const nodeTypes: NodeTypes = {
  service: ServiceNode,
  zone: ZoneNode,
  database: DatabaseNode,
  process: ProcessNode,
  decision: DecisionNode,
  swimlane: SwimlaneNode,
  wirescreen: WireScreenNode,
  wirebutton: WireButtonNode,
  wireinput: WireInputNode,
  wirecard: WireCardNode,
  wirenav: WireNavNode,
  wiretext: WireTextNode,
  wireimage: WireImageNode,
  annotation: AnnotationNode,
  sticky: StickyNode,
  freehand: FreehandNode,
  inventory: InventoryNode,
  wireframePlan: WireframePlanNode,
};

export {
  ServiceNode,
  ZoneNode,
  DatabaseNode,
  ProcessNode,
  DecisionNode,
  SwimlaneNode,
  WireScreenNode,
  WireButtonNode,
  WireInputNode,
  WireCardNode,
  WireNavNode,
  WireTextNode,
  WireImageNode,
  AnnotationNode,
  StickyNode,
  FreehandNode,
  InventoryNode,
  WireframePlanNode,
};
