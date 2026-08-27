# Integration Diagrams

## API Integration Map {#api-map}

**When:** Third-party services discussed. Tier 2.
**Layout:** Your system as large center box. External APIs as satellite boxes arranged around it.

**Node styling:**
- Your system: large rect, blue fill, center
- Critical dependency: red border, labeled "CRITICAL"
- Optional dependency: gray border
- Each external box shows: name, protocol (REST/GraphQL/SOAP), auth method (API key/OAuth/mTLS)

**Edge labels:** Data direction arrows + payload type + rate limit.

**Structure:**
```
                    [Stripe]
                   (REST, API key)
                       ↑↓
[SendGrid] ←── [Your System] ──→ [Twilio]
(REST)              ↓    ↓         (REST)
              [GitHub]  [Slack]
              (OAuth)   (Webhook)
```

## Webhook Flow {#webhook}

**Layout:** L→R: Event Source → Your Endpoint → Processing → Response/Retry.

**Structure:**
```
[External Service] ──POST webhook──→ [Ingress] → [Validate Signature] → [Process] → [200 OK]
                                                         │ fail
                                                    [DLQ / Retry Queue]
                                                         │
                                                    [Retry (exp backoff)]
```

**Must show:** Signature validation step, idempotency key check, retry strategy, DLQ.

## Message Queue Topology {#message-queue}

**Layout:** Producers left → Broker center (wide rect with topic lanes) → Consumers right.

**Broker rendering:** Wide rectangle divided into horizontal lanes, one per topic/queue.

**Structure:**
```
[Order Service] ──publish──→ ┌─────────────────────┐ ──subscribe──→ [Email Service]
[Payment Svc]   ──publish──→ │  order.created       │ ──subscribe──→ [Analytics]
                             │  payment.processed   │ ──subscribe──→ [Inventory]
                             │  user.registered      │
[User Service]  ──publish──→ └─────────────────────┘ ──subscribe──→ [Notification Svc]
                                     │
                                [Dead Letter Queue]
```

## OAuth / SSO Flow {#oauth}

**Render as sequence diagram.** See `security.md#auth` for full patterns.
Key flows: Auth Code + PKCE, Client Credentials, Device Flow, SAML.
