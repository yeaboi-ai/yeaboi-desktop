// --------------------------------------------------------------------------
// Architecture diagrams
// --------------------------------------------------------------------------

export interface Zone {
  id: string;
  label: string;
  style: 'solid' | 'dashed';
  color?: string;
  parentId?: string;
  children: string[];
}

export interface ArchNode {
  id: string;
  label: string;
  service?: string;
  provider?: 'aws' | 'gcp' | 'azure' | 'generic';
  zoneId?: string;
  description?: string;
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'animated';
}

export interface ArchitectureDiagram {
  type: 'architecture';
  title: string;
  zones: Zone[];
  nodes: ArchNode[];
  edges: ArchEdge[];
}

// --------------------------------------------------------------------------
// ERD diagrams
// --------------------------------------------------------------------------

export interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: string;
  nullable?: boolean;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
}

export interface Relationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  label?: string;
}

export interface ERDDiagram {
  type: 'erd';
  title: string;
  tables: Table[];
  relationships: Relationship[];
}

// --------------------------------------------------------------------------
// Flowchart diagrams
// --------------------------------------------------------------------------

export interface SwimLane {
  id: string;
  label: string;
  color?: string;
}

export interface FlowNodeTechnical {
  method?: string; // GET, POST, PUT, DELETE
  endpoint?: string; // /api/follows
  service?: string; // user-service
  notes?: string; // triggers welcome email webhook
}

export interface FlowNode {
  id: string;
  label: string;
  shape: 'process' | 'decision' | 'start' | 'end' | 'io' | 'database' | 'subprocess';
  laneId?: string;
  subflowIds?: string[]; // IDs of nodes in a detailed sub-flow for this step
  screenId?: string; // ID of the associated wireframe screen
  technical?: FlowNodeTechnical; // API/implementation detail, shown in technical view
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed';
}

export interface FlowchartDiagram {
  type: 'flow';
  title: string;
  swimLanes?: SwimLane[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// --------------------------------------------------------------------------
// Wireframe diagrams
// --------------------------------------------------------------------------

export type WireElementType =
  | 'button'
  | 'input'
  | 'textarea'
  | 'card'
  | 'nav'
  | 'list'
  | 'image'
  | 'text'
  | 'modal'
  | 'header'
  | 'footer'
  | 'tabs'
  | 'toggle'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'avatar'
  | 'badge'
  | 'table';

export interface WireElement {
  id: string;
  type: WireElementType;
  label?: string;
  placeholder?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: WireElement[];
  variant?: string;
}

export interface Screen {
  id: string;
  name: string;
  device: 'mobile' | 'tablet' | 'desktop';
  elements: WireElement[];
}

export interface ScreenFlow {
  from: string;
  to: string;
  trigger: string;
}

export type WireframeFidelity = 'low' | 'high';

export interface WireframeDiagram {
  type: 'wireframe';
  title: string;
  fidelity?: WireframeFidelity; // defaults to 'low' on the backend; undefined tolerated at the boundary
  screens: Screen[];
  flows?: ScreenFlow[];
}

// --------------------------------------------------------------------------
// Union types
// --------------------------------------------------------------------------

export type DiagramData = ArchitectureDiagram | ERDDiagram | FlowchartDiagram | WireframeDiagram;

export type DiagramType = DiagramData['type'];
