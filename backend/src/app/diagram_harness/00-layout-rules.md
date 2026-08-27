# Diagram Layout Rules

> Apply to ALL diagrams. Read before generating any diagram.

## Spacing & Grid
- Minimum 80px between nodes, 120px between groups/boundaries
- Snap to 40px grid
- Minimum node size: 180×60px
- Boundary padding: 20px inside edges

## Flow Direction
- **Data/request flow:** left → right
- **Hierarchy/layers:** top → down
- **Time sequence:** top → down (sequence diagrams)
- **User journey:** left → right

## Node Style
- Rounded rectangle, 14px border radius
- Icon positioned left of label (inside node)
- Label centered, 14px sans-serif (fontFamily 3)
- Min width accommodates label + icon + 40px padding each side

## Edge Style
- 2px stroke, color #666666
- No roughness (roughness: 0)
- Label at midpoint, 11px sans-serif
- Arrow: endArrowhead only (no start arrow unless bidirectional)
- Solid line = synchronous / direct, dashed = async / event-based

## Color System
- Max 5 fill colors per diagram
- Muted fills (low saturation), bright strokes (high saturation)
- Standard palette per logical group:

| Group | Fill | Stroke |
|---|---|---|
| Frontend/Client | #1c3a5e | #60a5fa |
| Backend/Service | #1a3a2a | #4ade80 |
| Database/Storage | #3d2e0a | #fbbf24 |
| External/3rd-party | #2d1f5e | #a78bfa |
| Queue/Cache | #3d0a2e | #f472b6 |
| User/Actor | #0c3644 | #22d3ee |
| Gateway/LB | #1c1c1c | #858585 |

## Boundaries / Groups
- Dashed stroke, 1px, color matching group
- Fill: #ffffff08 (barely visible)
- Header label: top-left, 12px, uppercase, muted color
- Use for: VPCs, subnets, clusters, deployment units, trust boundaries

## Annotations
- 10px font, muted color (#999)
- Protocol labels on arrows (HTTP, gRPC, WS, TCP)
- Port numbers where relevant
- Volume/throughput estimates in parentheses

## Excalidraw Defaults

Node:
```json
{ "roughness": 0, "strokeWidth": 2, "fontFamily": 3, "fontSize": 14, "roundness": {"type": 3, "value": 14}, "fillStyle": "solid", "opacity": 90 }
```

Edge:
```json
{ "roughness": 0, "strokeWidth": 2, "strokeColor": "#666666", "fontFamily": 3, "fontSize": 11 }
```

Boundary:
```json
{ "roughness": 0, "strokeWidth": 1, "strokeStyle": "dashed", "fillStyle": "solid", "backgroundColor": "#ffffff08", "fontFamily": 3, "fontSize": 12 }
```

## Canvas Zoning

Multiple diagram types on one canvas. Each occupies its own zone with clear separation.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                          │
│  (high-level components, service connections)                   │
│  Zone: x=0, y=0, w=2000, h=800                                │
├─────────────────────────────┬───────────────────────────────────┤
│       DATA MODEL (ERD)      │        CLOUD INFRASTRUCTURE      │
│  (tables, relationships)    │  (AWS/GCP/Azure, VPCs, subnets)  │
│  Zone: x=0, y=900          │  Zone: x=1100, y=900             │
│  w=1000, h=800              │  w=1000, h=800                   │
├─────────────────────────────┼───────────────────────────────────┤
│       USER FLOWS            │        CI/CD PIPELINE             │
│  (screens, navigation)     │  (build → deploy stages)          │
│  Zone: x=0, y=1800         │  Zone: x=1100, y=1800            │
│  w=1000, h=600              │  w=1000, h=600                   │
├─────────────────────────────┴───────────────────────────────────┤
│                    AUTH / SECURITY FLOW                         │
│  (sequence diagram: login, token exchange)                     │
│  Zone: x=0, y=2500, w=2000, h=500                             │
└─────────────────────────────────────────────────────────────────┘
```

**Zone rules:**
- 100px gap between zones
- Each zone has a title label: 16px, uppercase, muted, positioned top-left of zone
- Zone boundary: very subtle dashed line (#333, 0.5px) or no border (just spatial separation)
- Zones expand downward as content grows — never overlap
- System architecture always occupies the top zone (it's the overview)
- New diagram types from conversation get assigned to the next available zone
- Zone order: Architecture → Data → Infrastructure → User Flows → DevOps → Security

**Zoom behavior:**
- `scrollToContent` targets a specific zone when generated (zoom to that zone)
- Full canvas view: zoom out to see all zones as an overview

## Anti-Patterns (What Makes Diagrams Look Bad)
- Crossing arrows (rearrange nodes to eliminate)
- Uneven spacing between nodes
- Mixed flow directions in same diagram
- Too many nodes (>12 = split into sub-diagrams)
- Orphan nodes with no connections
- Labels that overflow node boundaries
- Inconsistent node sizes for same-type elements
