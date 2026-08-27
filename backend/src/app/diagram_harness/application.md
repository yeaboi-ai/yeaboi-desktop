# Application Diagrams

## Sequence Diagram {#sequence}

**When:** Auth flows, multi-step API calls, complex interactions. Tier 1.
**Layout:** Vertical timeline. Participants as columns L→R in order of first interaction: User → Frontend → Backend → DB → External.

**Elements:**
| Element | Rendering |
|---|---|
| Participant | Box at top of vertical dashed lifeline |
| Sync call | Solid arrow L→R, labeled with method |
| Response | Dashed arrow R→L, labeled with return |
| Activation | Thin filled rectangle on lifeline during processing |
| Self-call | Loop arrow back to same lifeline |
| Alt frame | Rectangle spanning lifelines, labeled "alt [condition]" |
| Loop frame | Rectangle labeled "loop [condition]" |
| Async | Solid arrow with open arrowhead |

**Structure:**
```
 User       Frontend      Backend        DB          Stripe
  │            │             │            │             │
  │──click──→  │             │            │             │
  │            │──POST /pay─→│            │             │
  │            │             │──SELECT───→│             │
  │            │             │←──user─────│             │
  │            │             │──create────────────────→ │
  │            │             │←──payment_intent─────── │
  │            │←──{clientSecret}│        │             │
  │←──show form│             │            │             │
```

## State Machine {#state-machine}

**When:** Order lifecycle, user account states, workflow engines. Tier 2.
**Layout:** L→R or T→B by lifecycle progression. Initial state (●) top-left, final (◉) bottom-right.

**Nodes:** Rounded rectangles = states. Fill color by phase:
| Phase | Fill/Stroke |
|---|---|
| Initial/Draft | #1c1c1c / #858585 |
| Active/Processing | #1c3a5e / #60a5fa |
| Success/Complete | #1a3a2a / #4ade80 |
| Error/Failed | #3d1515 / #f87171 |
| Terminal/Archived | #1c1c1c / #555555 |

**Edges:** Arrow labeled `trigger [guard] / action`.
**Example:** `● → draft → submitted → [approved] → active → completed → archived → ◉`

## Component Diagram (C4) {#c4}

**C4 L1 — Context:**
- Your system = single large blue box, center
- Users = person icon or labeled circle, edges
- External systems = gray boxes, edges
- 3-5 elements max. Big picture only.

**C4 L2 — Container:**
- System boundary = dashed blue rectangle
- Inside: containers (Web App, API, Worker, DB, Queue)
- Each container labeled with tech stack: "[Next.js]", "[FastAPI]", "[PostgreSQL]"
- Edges: communication protocols

**C4 L3 — Component:**
- Single container exploded. Boundary = that container's box.
- Internal modules as smaller boxes.
- External dependencies shown at edges.

## Class Diagram {#class}

**Layout:** Inheritance T→B (parent above). Composition/aggregation L→R.
**Node:** 3-section box: Name | Attributes | Methods. Visibility prefixes: + - # ~
**Edges:**
- `▷` solid triangle = inheritance
- `◆` filled diamond = composition
- `◇` empty diamond = aggregation
- `-->` dashed = dependency
- `—` solid = association (labeled with role + multiplicity)

## Activity Diagram {#activity}

**Layout:** T→B flow with swim lanes for parallel responsibilities.
**Nodes:** Rounded rect = activity, Diamond = decision, Bar = fork/join (parallel), ● = start, ◉ = end.
**Edges:** Solid arrows with guard conditions on decision branches [yes] / [no].
