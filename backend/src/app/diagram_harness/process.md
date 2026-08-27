# Business Process Diagrams

## Swimlane / Cross-Functional Flow {#swimlane}

**When:** Team responsibilities discussed. Tier 2.
**Layout:** Horizontal lanes, one per role/team/system. Steps flow L→R within lanes. Handoffs = arrows crossing lane boundaries.

**Lane rendering:** Full-width rows, alternating subtle backgrounds (#1a1a1a, #151515). Label on left edge, 12px uppercase.

**Structure:**
```
┌─ Customer ──────────────────────────────────────────────┐
│ [Browse] → [Add to Cart] → [Checkout] →                │
├─ Frontend ──────────────────────────────────────────────┤
│                              [Validate] → [Show Confirm]│
├─ Backend ───────────────────────────────────────────────┤
│                    [Create Order] → [Process Payment] → │
├─ External ──────────────────────────────────────────────┤
│                                     [Stripe Charge] →   │
│                                     [Send Email]        │
└─────────────────────────────────────────────────────────┘
```

## Decision Tree {#decision-tree}

**Layout:** T→B tree. Root question at top, branches for each answer.
**Nodes:** Decision = diamond or rect with "?" suffix. Outcome = rounded rect.
**Edge labels:** Condition on each branch ("yes", "no", ">$100", "free plan").
**Outcome colors:** Positive=#1a3a2a/#4ade80, Negative=#3d1515/#f87171, Neutral=#1c1c1c/#858585.

## Workflow Diagram {#workflow}

**Simpler than BPMN.** Steps as rounded rects, decisions as diamonds, arrows between.
**Layout:** T→B or L→R depending on complexity. Parallel paths shown with fork/join bars.

## BPMN Diagram {#bpmn}

**Notation (BPMN 2.0):**
| Symbol | Shape |
|---|---|
| Start event | Thin circle |
| End event | Thick circle |
| Task | Rounded rectangle |
| Gateway (exclusive) | Diamond with X |
| Gateway (parallel) | Diamond with + |
| Gateway (inclusive) | Diamond with O |
| Pool | Large rect with header |
| Lane | Subdivision within pool |
| Message flow | Dashed arrow |
| Sequence flow | Solid arrow |

**Layout:** Pools as large horizontal containers. Lanes within. Flow L→R. Message flows between pools (dashed, vertical).

## Value Stream Map {#value-stream}

**Layout:** L→R: customer request → all process steps → delivery.
**Above timeline:** Information flow (dashed arrows).
**Below timeline:** Lead time bars, cycle time bars.
**Annotations:** Wait time, process time, %C/A (percent complete and accurate).
