# Standards & Notations

Quick reference for formal notation systems. Use when the conversation requires specific standard compliance.

## C4 Model

Four zoom levels. Start at L1, drill down as detail emerges.

| Level | Name | What it shows | Node count |
|---|---|---|---|
| L1 | Context | System + external users/systems | 3-6 |
| L2 | Container | Apps, DBs, queues within the system | 5-12 |
| L3 | Component | Modules within a single container | 5-15 |
| L4 | Code | Class/function level (rarely drawn) | — |

**Colors:** Your system = blue, external system = gray, person = cyan, database = amber.
**Labels:** Every box has: name (bold), technology [in brackets], one-sentence description below.

## UML — 14 Diagram Types

**Most useful in planning (generate these):**
1. Sequence — see `application.md#sequence`
2. Activity — see `application.md#activity`
3. State Machine — see `application.md#state-machine`
4. Use Case — actors (stick figures) connected to use case ovals inside system boundary
5. Component — see `application.md#c4`
6. Deployment — nodes (3D boxes) containing artifacts, connected by communication paths

**Rarely generated during planning:**
7. Class — detailed design phase
8. Object — instance-level class diagram
9. Package — module dependency
10. Composite structure — internal structure of a class
11. Communication — simplified sequence (numbered arrows between objects)
12. Interaction overview — activity diagram where nodes are sequence diagram fragments
13. Timing — state changes over time axis
14. Profile — UML extension mechanisms

## ArchiMate (Enterprise Architecture)

Three layers stacked T→B: Business → Application → Technology.
Each layer has: Active structure (who), Behavior (what), Passive structure (on what).
**Use only for:** Enterprise-scale planning with multiple business domains. Not typical for startups.

## BPMN 2.0

See `process.md#bpmn` for full symbol set.
ISO 19510 standard. Use when formal process documentation is required.

## Crow's Foot (ERD)

See `data.md#erd` for relationship symbols and table format.
Most common ERD notation in industry. Preferred over Chen notation.
