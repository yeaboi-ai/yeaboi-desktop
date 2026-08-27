# Security Diagrams

## Auth Flow (OAuth 2.0 / SSO) {#auth}

**When:** Auth discussed. Tier 1. Render as sequence diagram.
**Participants L→R:** User Browser → Client App → Auth Server (IdP) → Resource Server

**Auth Code + PKCE (SPAs):**
```
Browser    App         Auth Server    API
  │──click login──→│          │          │
  │                │──redirect─→│         │
  │←──login page───────────────│         │
  │──credentials──────────────→│         │
  │←──auth code + redirect─────│         │
  │──code────────→│            │         │
  │               │──code + verifier──→│ │
  │               │←──access_token─────│ │
  │               │──GET /api + token────→│
  │               │←──data───────────────│
  │←──render──────│            │         │
```

**Client Credentials (M2M):**
```
Service A                Auth Server        Service B
  │──client_id + secret────→│                  │
  │←──access_token──────────│                  │
  │──GET /api + token──────────────────────────→│
  │←──data─────────────────────────────────────│
```

## Threat Model (STRIDE) {#threat-model}

**Base:** Data flow diagram of the system.
**Overlay:** Trust boundaries as red dashed rectangles. Each boundary crossing annotated with STRIDE threats.

**STRIDE at each boundary:**
| Threat | Question |
|---|---|
| **S**poofing | Can an attacker pretend to be someone else? |
| **T**ampering | Can data be modified in transit? |
| **R**epudiation | Can actions be denied? |
| **I**nfo disclosure | Can data leak? |
| **D**enial of service | Can the service be overwhelmed? |
| **E**levation | Can privileges be escalated? |

**Annotations:** Red labels at each boundary crossing with applicable threats.

## Zero Trust Architecture {#zero-trust}

**Layout:** Every access request goes through: Identity → Policy Engine → Policy Enforcement Point → Resource.
**Key principle:** No implicit trust. Every arrow goes through a verification step.

**Structure:**
```
[User/Device] → [Identity Provider] → [Policy Engine] → [PEP] → [Resource]
                      ↑                     ↑
              [Device Trust]         [Context Signals]
              [MFA Status]           [Location, Time]
```

## Attack Surface Diagram {#attack-surface}

**Layout:** System in center. Entry points around the perimeter, color-coded by risk.
**Risk colors:** Critical=#f87171, High=#fb923c, Medium=#fbbf24, Low=#4ade80.
**Entry points:** Public APIs, admin panels, file uploads, webhooks, third-party integrations, DNS, email.
