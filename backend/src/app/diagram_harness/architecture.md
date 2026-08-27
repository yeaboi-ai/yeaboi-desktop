# Architecture Diagrams

## High-Level System Architecture {#high-level}

**When:** Always. First diagram in every session.
**Layout:** L→R. Clients left, gateway/API center-left, services center, data stores right, external APIs top or bottom.

**Node types:**
| Type | Color (fill/stroke) | Icon |
|---|---|---|
| Client (web/mobile) | #0c3644 / #22d3ee | 🖥 / 📱 |
| API Gateway / LB | #1c1c1c / #858585 | 🔀 |
| Backend Service | #1a3a2a / #4ade80 | ⚙️ |
| Database | #3d2e0a / #fbbf24 | 🗄 |
| Cache | #3d1515 / #f87171 | ⚡ |
| Queue / Broker | #3d0a2e / #f472b6 | 📨 |
| External API | #2d1f5e / #a78bfa | 🔌 |
| Worker / Job | #1a3a2a / #4ade80 | 🔧 |
| Storage (S3/blob) | #3d2e0a / #facc15 | 📁 |

**Structure pattern:**
```
[Web App] ─── HTTP ──→ [API Gateway] ──→ [Auth Service] ──→ [User DB]
[Mobile]  ─── HTTP ──↗                ──→ [Core API]     ──→ [Main DB]
                                      ──→ [Worker]       ──→ [Queue] ──→ [Email]
                                                                     ──→ [Push]
```

**Edge labels:** Protocol + format (e.g., "REST/JSON", "gRPC", "WebSocket", "events").
**Boundaries:** Group by deployment unit if >6 services.

## Microservices Architecture {#microservices}

**Layout:** Grid of services. Each service = box with its own DB directly below it. API Gateway spans the top. Message broker as horizontal bar.
**Key rule:** Database-per-service shown visually (each service has its own data store underneath).
**Annotations:** Mark patterns in use — saga, CQRS, event sourcing, circuit breaker.

**Structure:**
```
                    [API Gateway]
            ┌──────────┼──────────┐
        [User Svc]  [Order Svc]  [Payment Svc]
            │           │            │
        [User DB]   [Order DB]   [Payment DB]
            └───events──┼───events───┘
                    [Message Broker]
```

## Event-Driven Architecture {#event-driven}

**Layout:** Producers left → Broker center → Consumers right.
**Broker rendering:** Wide horizontal rectangle with topic lanes inside (like a swim lane bar).
**Edge labels:** Event type names on arrows (e.g., "OrderCreated", "PaymentProcessed").
**Must show:** DLQ, retry paths, idempotency markers.

## Serverless Architecture {#serverless}

**Layout:** Event sources left → Functions center → Downstream right. No server icons.
**Key difference:** Everything is a trigger→function→action chain. Show event types prominently.

## API Gateway Pattern {#api-gateway}

**Layout:** Clients top → Gateway center → Backend services fan out below.
**Annotations on gateway:** Rate limiting, auth, routing rules, response caching, request transformation.
