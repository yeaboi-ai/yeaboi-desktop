# Diagram Harness

> Entry point. Read this first. Routes you to the right diagram spec.

## Step 1: What was discussed?

| Conversation topic | Diagram type | File |
|---|---|---|
| Database, tables, schema, models | ERD | `data.md#erd` |
| Auth, login, OAuth, SSO | Auth flow | `application.md#sequence` |
| API, endpoints, REST, GraphQL | API integration map | `integration.md#api-map` |
| AWS/GCP/Azure, deploy, infra | Cloud architecture | `cloud.md` |
| Pipeline, CI/CD, staging, prod | CI/CD pipeline | `devops.md#cicd` |
| User flow, signup, checkout | User flow | `user-facing.md#user-flow` |
| Microservices, events, queues | System architecture | `architecture.md#system` |
| Pages, routes, navigation | Screen flow | `user-facing.md#screen-flow` |
| Team responsibilities | Swimlane | `process.md#swimlane` |
| Security, threats, encryption | Threat model | `security.md` |
| Monitoring, observability | Observability stack | `devops.md#observability` |
| UI layout, wireframe, screens | Wireframe | `user-facing.md#wireframe` |
| Any 3+ components discussed | High-level architecture | `architecture.md#high-level` |

## Step 2: Read the global layout rules

Every diagram follows `00-layout-rules.md`. Read it before generating anything.

## Step 3: Read the specific diagram file

Each file contains: exact node types, edge types, color scheme, layout pattern, and an ASCII example structure to follow.

## Files

| File | Covers |
|---|---|
| `00-layout-rules.md` | Global spacing, alignment, colors, fonts, Excalidraw settings |
| `architecture.md` | High-level, microservices, event-driven, serverless, API gateway |
| `cloud.md` | AWS, GCP, Azure, multi-cloud, K8s, VPC/subnet |
| `data.md` | ERD, DFD, data pipeline, database schema, warehouse |
| `application.md` | Sequence, state machine, component (C4), class, activity |
| `user-facing.md` | User flow, wireframe, screen flow, sitemap |
| `devops.md` | CI/CD pipeline, deployment strategy, observability, GitOps |
| `security.md` | Auth flows, threat model, zero trust, attack surface |
| `integration.md` | API map, webhook flow, message queue, OAuth/SSO flow |
| `process.md` | Swimlane, decision tree, BPMN, workflow, value stream |
| `standards.md` | C4 model, UML (14 types), ArchiMate, BPMN notation |
| `icons.md` | Icon set inventory, paths, sources |
| `wireframe-ui-patterns.md` | Mobile/tablet/desktop patterns, dark theme components, HTML/CSS reference |

## Auto-Generation Priority

**Tier 1 — every session:** High-level architecture, ERD, user flow, auth flow
**Tier 2 — when topic arises:** CI/CD, cloud arch, sequence diagram, state machine, API map
**Tier 3 — user-initiated templates:** Wireframe, K8s, monitoring, threat model, BPMN
