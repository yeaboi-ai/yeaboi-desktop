"""Realistic directory entry content for each seed profile.

Each profile maps to a list of directory entries with full markdown content
that looks like it came from real integration scans.
"""

STARTUP_ENTRIES = [
    {
        "path": "overview",
        "title": "Project Overview",
        "category": "overview",
        "source_provider": None,
        "content": """# Project Overview

**Product:** Planr — collaborative AI planning platform
**Type:** B2B SaaS
**Team:** 5 engineers, 1 designer, 1 PM
**Stage:** Early growth, ~200 teams on platform

## Tech Stack Summary
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Backend:** FastAPI (Python 3.12), async SQLAlchemy, Pydantic
- **Database:** PostgreSQL 16 (Neon), Redis (Upstash)
- **Hosting:** Vercel (frontend), Railway (backend), Neon (DB)
- **AI:** Claude API (Anthropic), Deepgram (STT), ElevenLabs (TTS)
- **Real-time:** WebSockets, LiveKit (voice/video), Yjs (collaboration)

## Architecture
Monolith backend with WebSocket support. Frontend is a Next.js App Router SPA. Real-time collaboration via Yjs CRDT sync. AI facilitator runs as a LiveKit agent worker.

## Repositories
| Repo | Purpose |
|------|---------|
| `neakoh/planning-platform` | Main monorepo (frontend + backend) |
""",
    },
    {
        "path": "frontend/index",
        "title": "Frontend Overview",
        "category": "frontend",
        "source_provider": "github",
        "content": """# Frontend

**Framework:** Next.js 16 (App Router)
**Language:** TypeScript 5.6
**Styling:** Tailwind CSS 4, CSS variables for theming
**Components:** shadcn/ui (base-nova style)
**Fonts:** Instrument Serif (display), DM Sans (body)

## Project Structure
```
frontend/
├── app/              # Next.js App Router pages
│   ├── projects/     # Project list + detail + sessions
│   ├── settings/     # Settings (profile, org, team, integrations)
│   ├── directory/    # Team knowledge base
│   ├── onboarding/   # New user onboarding flow
│   └── api/          # API proxy routes
├── components/       # React components
│   ├── ui/           # shadcn primitives
│   ├── canvas/       # Excalidraw/XYflow diagram editor
│   ├── kanban/       # Kanban board
│   ├── integrations/ # Integration management
│   └── onboarding/   # Onboarding step components
├── hooks/            # Custom React hooks
└── lib/              # Utilities, API client, auth
```

## Key Patterns
- **Auth:** NextAuth.js v5 with JWT strategy (GitHub + Google OAuth)
- **Data fetching:** `useAuthFetch()` hook injects JWT + org/team headers
- **Real-time:** WebSocket connections for session chat and board updates
- **State:** React context + server components (no Redux)
- **Dark mode:** Default, CSS variable-based theming
""",
    },
    {
        "path": "frontend/design-system",
        "title": "Design System",
        "category": "frontend",
        "source_provider": "github",
        "content": """# Design System

## Typography
- **Display:** Instrument Serif, italic, 400 weight
- **Body:** DM Sans, weights 300-600
- **Mono:** System monospace

## Colour Palette
- **Primary:** `#e5a630` (gold/amber)
- **Background:** `#0a0a0a`
- **Card:** `#121212`
- **Border:** `#222222`
- **Muted:** `#858585`
- **Destructive:** `#e5484d`

## Component Library
Using shadcn/ui with `base-nova` style. Installed components:
Button, Input, Label, Textarea, Card, Dialog, Badge, Separator, Switch, Slider, Collapsible

## Animation
- `animate-fade-in` — 0.4s ease opacity
- `animate-slide-up` — 0.5s cubic-bezier translateY + opacity
- `animate-scale-in` — 0.3s cubic-bezier scale
- Stagger classes: `.stagger-1` through `.stagger-6` (60ms increments)

## Design Principles
Editorial layouts, asymmetric compositions, typography-first hierarchy. Anti-AI-generic aesthetic — restraint over decoration.
""",
    },
    {
        "path": "backend/index",
        "title": "Backend Overview",
        "category": "backend",
        "source_provider": "github",
        "content": """# Backend

**Framework:** FastAPI 0.115
**Language:** Python 3.12
**ORM:** SQLAlchemy 2.0 (async, asyncpg)
**Validation:** Pydantic v2
**Database:** PostgreSQL 16 (Neon)
**Cache:** Redis (Upstash)

## Project Structure
```
backend/src/app/
├── main.py           # App factory, middleware, router registration
├── config.py         # Settings via pydantic-settings
├── auth.py           # JWT verification (NextAuth-compatible)
├── deps.py           # Dependency injection (user, org, team, db)
├── db.py             # Async session management
├── models/           # SQLAlchemy models (14 models)
├── routers/          # API route handlers (24 routers)
├── schemas/          # Pydantic request/response models
├── services/         # Business logic (20 services)
├── middleware/        # Rate limiting, error handling, timing
├── ws/               # WebSocket endpoints
└── orchestrator/     # AI agent pipeline
```

## Key Patterns
- **Auth:** HS256 JWT from NextAuth, validated in `auth.py`
- **Dependency injection:** `get_current_user`, `get_current_org`, `get_current_team`
- **Rate limiting:** slowapi, 60/min GET, 30/min mutations
- **Audit logging:** All mutations logged to `audit_logs` table
- **Migrations:** Alembic with async PostgreSQL

## API Conventions
- All routes prefixed with `/api/`
- Snake_case JSON, Pydantic schemas with `from_attributes = True`
- 201 for creation, 204 for deletion, standard HTTP error codes
""",
    },
    {
        "path": "backend/api-standards",
        "title": "API Standards",
        "category": "backend",
        "source_provider": "github",
        "content": """# API Standards

## URL Structure
```
GET    /api/projects                    # List
POST   /api/projects                    # Create (201)
GET    /api/projects/{id}               # Read
PATCH  /api/projects/{id}               # Update
DELETE /api/projects/{id}               # Delete (204)
GET    /api/projects/{id}/sessions      # Nested resource
```

## Authentication
All endpoints require `Authorization: Bearer <jwt>` header. Org and team context via `X-Org-Id` and `X-Team-Id` headers.

## Request/Response
- Request bodies: JSON, validated by Pydantic schemas
- Response bodies: JSON, serialised from SQLAlchemy models via `from_attributes`
- Timestamps: ISO 8601 with timezone
- IDs: UUID v4 as strings

## Error Responses
```json
{"detail": "Human-readable error message"}
```
Status codes: 400 (bad request), 401 (not authed), 403 (forbidden), 404 (not found), 409 (conflict), 422 (validation)

## Rate Limiting
- GET endpoints: 60 requests/minute
- POST/PATCH/DELETE: 30 requests/minute
- Rate limit headers included in responses
""",
    },
    {
        "path": "backend/data-layer",
        "title": "Data Layer",
        "category": "backend",
        "source_provider": "github",
        "content": """# Data Layer

## Database
**PostgreSQL 16** hosted on Neon (serverless). Connection via `asyncpg` driver with connection pooling.

## ORM
SQLAlchemy 2.0 with async session management. All queries use `AsyncSession`.

## Models (14)
| Model | Table | Purpose |
|-------|-------|---------|
| User | users | User accounts |
| Organization | organizations | Multi-tenant orgs |
| OrgMember | org_members | Org membership + roles |
| Team | teams | Teams within orgs |
| TeamMember | team_members | Team membership |
| Project | projects | Planning projects |
| Session | sessions | Planning sessions |
| ChatMessage | chat_messages | Session chat history |
| Board | boards | Kanban boards |
| Card | cards | Board cards |
| Blueprint | blueprint_iterations | Planning output |
| DirectoryEntry | directory_entries | Team knowledge base |
| OrgIntegration | org_integrations | External service connections |
| AuditLog | audit_logs | Mutation audit trail |

## Migrations
Alembic with async runner. Migrations in `backend/alembic/versions/`. Auto-generated from model changes.

## Cache
Redis (Upstash) for session state and rate limiting. Connection via `redis.asyncio`.
""",
    },
    {
        "path": "infra/index",
        "title": "Infrastructure Overview",
        "category": "infra",
        "source_provider": "vercel",
        "content": """# Infrastructure

## Hosting
| Service | Provider | Purpose | Cost |
|---------|----------|---------|------|
| Frontend | Vercel (Pro) | Next.js hosting, edge CDN | $20/mo |
| Backend | Railway | FastAPI + WebSocket server | $10/mo |
| Database | Neon (Pro) | PostgreSQL 16, serverless | $19/mo |
| Cache | Upstash | Redis, serverless | $0 (free tier) |
| LiveKit | LiveKit Cloud | Voice/video for sessions | $35/mo |
| Email | Resend | Transactional email | $0 (free tier) |

**Total: ~$84/month**

## Environments
- **Production:** Auto-deploys from `main` branch
- **Preview:** Vercel preview deploys on every PR
- **Development:** Local Docker Compose (PostgreSQL, Redis, Mailpit, LiveKit)

## Domains
- `planr.app` — production frontend (Vercel)
- `api.planr.app` — production backend (Railway)

## CI/CD
GitHub Actions:
- PR: lint + test + preview deploy
- Main: auto-deploy frontend (Vercel) + backend (Railway)
- Pre-commit hooks: ruff (Python), ESLint (TypeScript)
""",
    },
    {
        "path": "infra/vercel",
        "title": "Vercel Configuration",
        "category": "infra",
        "source_provider": "vercel",
        "content": """# Vercel

**Plan:** Pro ($20/mo)
**Framework:** Next.js 16 (auto-detected)
**Node version:** 20.x
**Build command:** `npm run build`
**Output directory:** `.next`

## Environment Variables
- `API_URL` — backend URL
- `NEXTAUTH_SECRET` — JWT signing secret
- `NEXTAUTH_URL` — OAuth callback URL
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `SENTRY_DSN` — Error tracking

## Deployments
- Production: auto-deploy on push to `main`
- Preview: every PR gets a unique URL
- Average build time: ~45 seconds

## Analytics
Vercel Analytics enabled. ~15k page views/month. P95 TTFB: 120ms.
""",
    },
    {
        "path": "security/index",
        "title": "Security Overview",
        "category": "security",
        "source_provider": "github",
        "content": """# Security

## Authentication
- **Method:** JWT (HS256) via NextAuth.js v5
- **Providers:** GitHub OAuth, Google OAuth, magic email (dev only)
- **Session:** Stateless JWT, 1h expiry with refresh
- **API:** Bearer token in Authorization header

## Authorization
- **Model:** Org-level roles (admin/member) + team-level roles
- **Enforcement:** FastAPI dependencies (`get_current_user`, `get_current_org`)
- **Admin actions:** Org management, member invites, team CRUD, AI config

## Data Protection
- **API keys:** AES-256-GCM encryption at rest (AI provider keys, integration tokens)
- **Secrets:** Environment variables, never in code
- **Transport:** HTTPS everywhere (Vercel + Railway enforce TLS)
- **CORS:** Restricted to frontend domain

## Known Gaps
- No RBAC beyond admin/member (fine-grained permissions planned)
- No SOC2 / GDPR compliance measures yet
- No WAF or DDoS protection beyond Vercel's built-in
- Rate limiting is basic (IP-based, no user-level quotas)
""",
    },
    {
        "path": "services/index",
        "title": "Services Overview",
        "category": "services",
        "source_provider": "github",
        "content": """# Services

## Core Services
| Service | Description |
|---------|-------------|
| **Planning Session** | Real-time collaborative planning with AI facilitator |
| **Blueprint Generator** | Structured output from planning sessions |
| **Kanban Board** | Project task management with WebSocket sync |
| **Orchestrator** | AI agent pipeline: cards → branches → PRs |
| **Directory** | Team knowledge base (this system) |

## AI Services
| Service | Provider | Purpose |
|---------|----------|---------|
| AI Facilitator | Claude (Anthropic) | Planning session guidance |
| Speech-to-Text | Deepgram | Voice input transcription |
| Text-to-Speech | ElevenLabs | AI voice responses |
| Harness Generator | Claude | Project scaffold generation |

## Internal Services
| Service | Purpose |
|---------|---------|
| `audit_service.py` | Mutation logging |
| `email_service.py` | Transactional email via Resend |
| `crypto.py` | AES-256-GCM encryption |
| `notification_service.py` | In-app notifications |
""",
    },
    {
        "path": "costs/index",
        "title": "Monthly Costs",
        "category": "costs",
        "source_provider": "vercel",
        "content": """# Monthly Costs

**Total: ~$84/month** (as of April 2026)

## Breakdown
| Service | Provider | Monthly | Notes |
|---------|----------|---------|-------|
| Frontend hosting | Vercel Pro | $20 | Includes analytics, preview deploys |
| Backend hosting | Railway | $10 | Auto-sleep when idle |
| Database | Neon Pro | $19 | 10GB storage, autoscaling compute |
| Cache | Upstash | $0 | Free tier (10k commands/day) |
| Voice/Video | LiveKit Cloud | $35 | ~50 session hours/month |
| Email | Resend | $0 | Free tier (<100 emails/day) |
| Error tracking | Sentry | $0 | Free tier (5k events/month) |
| Domain | Cloudflare | $0 | Free DNS + proxy |

## AI Costs (Variable)
| Model | Use Case | Est. Monthly |
|-------|----------|-------------|
| Claude Sonnet | Facilitator, blueprints | ~$30 |
| Claude Haiku | Classification, quick tasks | ~$5 |
| Deepgram | STT in sessions | ~$8 |
| ElevenLabs | TTS responses | ~$5 |

**AI total: ~$48/month** (scales with usage)

## Trend
Costs increased ~20% last month due to growing session volume. LiveKit is the largest fixed cost. Consider reserved capacity at >100 sessions/month.
""",
    },
    {
        "path": "architecture/index",
        "title": "Architecture Overview",
        "category": "architecture",
        "source_provider": "github",
        "content": """# Architecture

## System Diagram
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser    │────▶│  Vercel CDN  │────▶│  Next.js     │
│   (React)    │◀────│              │◀────│  App Router  │
└──────┬───────┘     └──────────────┘     └──────┬──────┘
       │                                          │
       │ WebSocket + REST                         │ Proxy
       │                                          │
       ▼                                          ▼
┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   FastAPI     │────▶│  PostgreSQL  │     │   Redis     │
│   (Railway)   │◀────│  (Neon)      │     │  (Upstash)  │
└──────┬───────┘     └──────────────┘     └─────────────┘
       │
       ├── LiveKit Agent (voice AI)
       ├── Claude API (facilitator)
       ├── Deepgram (STT)
       └── ElevenLabs (TTS)
```

## Data Flow
1. User opens planning session → WebSocket connection to FastAPI
2. Voice input → Deepgram STT → text to AI facilitator
3. AI facilitator (Claude) processes → structured response
4. Response → ElevenLabs TTS → audio back to user
5. Session output → blueprint → kanban cards
6. Orchestrator picks cards → creates branches → Claude writes code → PRs

## Key Decisions
- **Monolith over microservices:** Team is small, latency matters for real-time features
- **WebSocket over SSE:** Bidirectional needed for collaboration
- **PostgreSQL over MongoDB:** Relational data model, strong consistency
- **Vercel + Railway split:** Vercel for edge CDN + SSR, Railway for persistent WebSocket connections
""",
    },
]

ENTERPRISE_ENTRIES = [
    {
        "path": "overview",
        "title": "Platform Overview",
        "category": "overview",
        "source_provider": None,
        "content": """# Platform Overview

**Product:** Enterprise Resource Planning & Analytics Platform
**Type:** B2B SaaS (multi-tenant)
**Team:** 45 engineers across 6 squads, 8 designers, 12 PMs
**Stage:** Series B, ~2,000 enterprise customers

## Tech Stack
- **Frontend:** React 19 (micro-frontends via Module Federation), TypeScript
- **Backend:** Java 21 (Spring Boot) + Python 3.12 (ML services)
- **Database:** PostgreSQL 16 (AWS RDS), Redis (ElastiCache), Elasticsearch 8
- **Cloud:** AWS (primary), GCP (ML workloads)
- **CI/CD:** GitHub Actions + GitLab CI (acquired team legacy)
- **Monitoring:** Datadog, PagerDuty, Sentry

## Repositories
| Org | Repo Count | Primary Language |
|-----|-----------|-----------------|
| GitHub (acme-corp) | 187 repos | TypeScript, Java |
| GitLab (acme-ml) | 23 repos | Python |
""",
    },
    {
        "path": "frontend/index",
        "title": "Frontend Platform",
        "category": "frontend",
        "source_provider": "github",
        "content": """# Frontend Platform

**Architecture:** Micro-frontends via Webpack Module Federation
**Framework:** React 19, TypeScript 5.6
**Design System:** Internal (Acme UI), built on Radix primitives
**State:** Zustand (global), React Query (server state)

## Micro-frontends
| App | Team | Port | Purpose |
|-----|------|------|---------|
| shell | Platform | 3000 | App shell, routing, auth |
| dashboard | Analytics | 3001 | Reporting dashboards |
| resource-mgmt | Core | 3002 | Resource CRUD, workflows |
| billing | Revenue | 3003 | Subscriptions, invoicing |
| admin | Platform | 3004 | Internal admin tools |
| onboarding | Growth | 3005 | Customer onboarding flow |

## Shared Libraries
- `@acme/ui` — Design system components (142 components)
- `@acme/auth` — Auth context, token management
- `@acme/api-client` — Generated TypeScript SDK from OpenAPI spec
- `@acme/analytics` — Event tracking, feature flags

## Build
- Webpack 5 with Module Federation
- Turborepo for monorepo orchestration
- Average build: ~3 minutes (full), ~45s (single app)
""",
    },
    {
        "path": "backend/index",
        "title": "Backend Services",
        "category": "backend",
        "source_provider": "github",
        "content": """# Backend Services

**Architecture:** Service-oriented (not full microservices)
**Primary:** Java 21 (Spring Boot 3.3)
**ML Services:** Python 3.12 (FastAPI)
**API Gateway:** AWS API Gateway + Lambda authorizer

## Services
| Service | Language | Team | Database |
|---------|----------|------|----------|
| core-api | Java | Core | PostgreSQL |
| auth-service | Java | Platform | PostgreSQL + Redis |
| billing-service | Java | Revenue | PostgreSQL |
| notification-service | Java | Platform | PostgreSQL + SQS |
| analytics-engine | Python | Analytics | PostgreSQL + Elasticsearch |
| ml-pipeline | Python | ML | PostgreSQL + S3 |
| search-service | Java | Core | Elasticsearch |
| file-service | Java | Platform | S3 |
| webhook-service | Java | Platform | PostgreSQL + SQS |

## API Standards
- REST with OpenAPI 3.1 specs (auto-generated)
- gRPC for internal service-to-service communication
- Event-driven via SQS/SNS for async workflows
- API versioning: URL-based (`/v1/`, `/v2/`)
""",
    },
    {
        "path": "infra/aws",
        "title": "AWS Infrastructure",
        "category": "infra",
        "source_provider": "aws",
        "content": """# AWS Infrastructure

**Account:** 342871956230 (acme-production)
**Region:** us-east-1 (primary), eu-west-1 (DR)
**Organisation:** 4 accounts (prod, staging, dev, security)

## Compute
| Resource | Count | Type | Purpose |
|----------|-------|------|---------|
| ECS Fargate tasks | 24 | Various | Application services |
| Lambda functions | 47 | Various | Event handlers, API auth |
| EC2 instances | 3 | m6i.xlarge | Bastion, Jenkins, monitoring |

## Database
| Resource | Type | Size | Purpose |
|----------|------|------|---------|
| RDS PostgreSQL | db.r6g.2xlarge | 500GB | Primary database |
| RDS PostgreSQL (read) | db.r6g.xlarge | 500GB | Read replica |
| ElastiCache Redis | cache.r6g.large | 26GB | Session cache, rate limiting |
| Elasticsearch | 3x r6g.large.search | 300GB | Full-text search, analytics |

## Storage
| Resource | Size | Purpose |
|----------|------|---------|
| S3 (acme-uploads) | 2.1TB | Customer file uploads |
| S3 (acme-backups) | 890GB | Database backups |
| S3 (acme-logs) | 340GB | Application logs archive |
| S3 (acme-ml-data) | 1.8TB | ML training data |

## Networking
- VPC: 10.0.0.0/16 with public/private/data subnets across 3 AZs
- ALB: 2 (external + internal)
- CloudFront: 1 distribution (static assets + API cache)
- Route53: acme-platform.com + 12 subdomains
- NAT Gateway: 3 (one per AZ)
- VPN: AWS Client VPN for engineer access

## Security
- IAM: 23 roles, least-privilege policies
- Secrets Manager: 34 secrets (DB creds, API keys, certificates)
- WAF: CloudFront + ALB rules (OWASP core rule set)
- GuardDuty: Enabled, alerts to PagerDuty
- Config: Compliance rules for CIS benchmarks
""",
    },
    {
        "path": "infra/gcp",
        "title": "GCP Infrastructure",
        "category": "infra",
        "source_provider": "gcp",
        "content": """# GCP Infrastructure

**Project:** acme-ml-prod (ID: acme-ml-prod-392847)
**Region:** us-central1
**Purpose:** ML training and inference workloads

## Compute
| Resource | Count | Type | Purpose |
|----------|-------|------|---------|
| GKE cluster | 1 | n2-standard-8 (3 nodes) | ML serving |
| Cloud Run | 4 services | Various | ML API endpoints |
| Vertex AI | 2 endpoints | Various | Model serving |

## Storage
| Resource | Size | Purpose |
|----------|------|---------|
| Cloud Storage (training-data) | 3.2TB | ML training datasets |
| Cloud Storage (models) | 180GB | Trained model artifacts |
| BigQuery | ~500GB | Analytics data warehouse |

## ML Pipeline
Vertex AI Pipelines for training orchestration. Models deployed to GKE via Seldon Core.

## Monthly Cost: ~$4,200
- GKE: $1,800
- Vertex AI: $1,200
- Cloud Storage: $400
- BigQuery: $300
- Networking: $500
""",
    },
    {
        "path": "infra/ci-cd",
        "title": "CI/CD Pipeline",
        "category": "infra",
        "source_provider": "github",
        "content": """# CI/CD Pipeline

## GitHub Actions (Primary)
Used for all GitHub-hosted repos (187 repos).

### Workflows
- **PR Pipeline:** lint → test → build → preview deploy (~8 min)
- **Main Pipeline:** lint → test → build → deploy staging → smoke tests → deploy prod (~15 min)
- **Nightly:** Full integration test suite, dependency scanning, SAST
- **Release:** Semantic versioning, changelog generation, GitHub releases

### Runners
- GitHub-hosted: ubuntu-latest (most jobs)
- Self-hosted: 4x m6i.xlarge EC2 (heavy builds, security scans)

## GitLab CI (ML Team)
Used for GitLab-hosted ML repos (23 repos).

### Pipelines
- **MR Pipeline:** lint → test → train (sample) → validate (~20 min)
- **Main Pipeline:** full train → evaluate → deploy to GKE (~45 min)
- **Scheduled:** Weekly full retrain on latest data

## Deployment Strategy
- **Services:** Blue-green via ECS (zero-downtime)
- **Frontend:** Atomic deploys via Vercel-like preview + promote
- **ML Models:** Canary rollout (10% → 50% → 100%) with automatic rollback on error rate spike
""",
    },
    {
        "path": "security/index",
        "title": "Security Posture",
        "category": "security",
        "source_provider": "aws",
        "content": """# Security Posture

## Compliance
- **SOC 2 Type II:** Certified (annual audit by Deloitte)
- **GDPR:** Compliant (DPA available, eu-west-1 for EU customers)
- **HIPAA:** Not yet (roadmap Q4 2026)

## Authentication
- **SSO:** SAML 2.0 + OIDC (Okta, Azure AD, Google Workspace)
- **MFA:** Required for all users (TOTP or WebAuthn)
- **API:** OAuth 2.0 with JWT bearer tokens (RS256)
- **Service-to-service:** mTLS + IAM roles

## Data Protection
- **At rest:** AES-256 (RDS, S3, EBS all encrypted)
- **In transit:** TLS 1.3 everywhere
- **PII:** Encrypted at application level, access-logged
- **Backups:** Daily automated, 30-day retention, cross-region replication

## Monitoring
- **SIEM:** Datadog Security Monitoring
- **Vulnerability scanning:** Snyk (dependencies), Semgrep (SAST)
- **Penetration testing:** Annual (NCC Group), quarterly automated (HackerOne)
- **Incident response:** PagerDuty escalation → Slack war room → RCA within 48h

## IAM
- 23 IAM roles, reviewed quarterly
- No long-lived access keys (STS assume-role only)
- Break-glass procedure documented for emergency access
""",
    },
    {
        "path": "costs/index",
        "title": "Monthly Infrastructure Costs",
        "category": "costs",
        "source_provider": "aws",
        "content": """# Monthly Infrastructure Costs

**Total: ~$18,400/month** (as of April 2026)

## AWS ($14,200/month)
| Category | Monthly | % |
|----------|---------|---|
| Compute (ECS + Lambda + EC2) | $5,800 | 41% |
| Database (RDS + ElastiCache + ES) | $4,200 | 30% |
| Storage (S3) | $1,400 | 10% |
| Networking (NAT, ALB, CloudFront) | $1,800 | 13% |
| Other (Secrets, WAF, Config) | $1,000 | 7% |

## GCP ($4,200/month)
| Category | Monthly |
|----------|---------|
| GKE + Cloud Run | $1,800 |
| Vertex AI | $1,200 |
| Storage + BigQuery | $700 |
| Networking | $500 |

## Trend
- +8% MoM (growing customer base)
- Reserved instances saving ~$2,100/month vs on-demand
- Action item: Right-size ElastiCache (currently at 35% utilisation)
- Action item: Move cold S3 data to Glacier (~$200/month saving)
""",
    },
    {
        "path": "services/monitoring",
        "title": "Monitoring & Observability",
        "category": "services",
        "source_provider": "datadog",
        "content": """# Monitoring & Observability

## Datadog
**Plan:** Pro ($23/host/month, 28 hosts)
**Modules:** APM, Infrastructure, Logs, Synthetics, Security

### Dashboards
| Dashboard | Purpose | Team |
|-----------|---------|------|
| Platform Overview | SLIs, error rates, latency | Platform |
| Core API Health | Request rates, P99 latency, error breakdown | Core |
| Database Performance | Query performance, connection pools, replication lag | Platform |
| ML Pipeline | Training metrics, inference latency, model drift | ML |
| Business KPIs | Active users, session count, feature adoption | Product |

### Alerts (38 active)
- P99 latency > 500ms (core-api) → PagerDuty
- Error rate > 1% (any service) → PagerDuty
- Database connection pool > 80% → Slack
- Disk usage > 85% → Slack
- ML model accuracy drift > 5% → Slack + email

## PagerDuty
**Schedules:** 3 rotation schedules (platform, core, ML)
**Escalation:** On-call → team lead → engineering manager (15 min steps)
**MTTR target:** < 30 minutes for P1, < 2 hours for P2

## Sentry
**Plan:** Team ($26/month)
Error tracking for frontend and backend. ~2,000 events/week. Grouped by issue, assigned to owning team.
""",
    },
]

AGENCY_ENTRIES = [
    {
        "path": "overview",
        "title": "Agency Overview",
        "category": "overview",
        "source_provider": None,
        "content": """# Agency Overview

**Company:** Pixel & Code Digital Agency
**Type:** Full-service web agency
**Team:** 4 developers, 2 designers, 1 PM
**Clients:** 12 active projects

## Stack
- **Frontend:** Next.js / Astro (depends on client)
- **CMS:** Sanity / Contentful / WordPress
- **Hosting:** Netlify (static), Vercel (Next.js)
- **Design:** Figma (design) → code handoff
- **PM:** Asana (internal), Trello (client-facing)

## Client Projects (Active)
| Client | Stack | Status |
|--------|-------|--------|
| BrightFoods | Next.js + Sanity | In development |
| LegalEase | Astro + Contentful | Launched, maintenance |
| UrbanFit | Next.js + Shopify | In development |
| GreenPath | WordPress + WooCommerce | Launched, retainer |
| TechVault | Next.js + Supabase | In development |
""",
    },
    {
        "path": "frontend/index",
        "title": "Frontend Standards",
        "category": "frontend",
        "source_provider": "github",
        "content": """# Frontend Standards

## Frameworks (by project type)
- **Marketing sites:** Astro 4 (static, fast, content-focused)
- **Web apps:** Next.js 16 (React, SSR, API routes)
- **E-commerce:** Next.js + Shopify Hydrogen or WooCommerce

## Shared Conventions
- TypeScript everywhere
- Tailwind CSS 4 for styling
- Prettier + ESLint for formatting
- Component-first architecture
- Mobile-first responsive design

## Starter Templates
| Template | Use Case | Repo |
|----------|----------|------|
| `astro-marketing` | Brochure sites | pixelcode/astro-starter |
| `nextjs-app` | Web applications | pixelcode/next-starter |
| `nextjs-ecom` | E-commerce | pixelcode/ecom-starter |

## Performance Targets
- Lighthouse: >90 all categories
- LCP: <2.5s
- CLS: <0.1
- Bundle size: <200KB initial JS
""",
    },
    {
        "path": "infra/index",
        "title": "Hosting & Deployment",
        "category": "infra",
        "source_provider": "netlify",
        "content": """# Hosting & Deployment

## Netlify (Primary for static sites)
**Plan:** Pro ($19/month per member)
- 8 sites deployed
- Branch deploys for client review
- Netlify Forms for contact forms
- Netlify Functions for serverless endpoints

## Vercel (Next.js projects)
- 4 projects deployed
- Preview deploys per PR
- Edge functions for API routes

## Deployment Flow
1. Developer pushes to feature branch
2. Preview deploy auto-triggers (Netlify/Vercel)
3. Share preview URL with client in Trello
4. Client approves → merge to main
5. Production deploy auto-triggers

## DNS
All client domains managed via Cloudflare. SSL auto-provisioned.

## Monthly Hosting Costs
| Client | Provider | Monthly |
|--------|----------|---------|
| BrightFoods | Vercel | $0 (free) |
| LegalEase | Netlify | $0 (free) |
| UrbanFit | Vercel Pro | $20 |
| GreenPath | WP Engine | $30 |
| TechVault | Vercel | $0 (free) |
| **Total** | | **$50** |
""",
    },
]

MIXED_ENTRIES = [
    {
        "path": "overview",
        "title": "Project Overview",
        "category": "overview",
        "source_provider": None,
        "content": """# Project Overview

**Product:** DataFlow — real-time data pipeline platform
**Type:** B2B SaaS
**Team:** 8 engineers, 2 SRE
**Stage:** Seed, ~50 customers

## Tech Stack
- **Frontend:** React 19, Vite, TypeScript
- **Backend:** Go (API), Python (pipeline workers)
- **Database:** PostgreSQL (RDS), ClickHouse (analytics)
- **Cloud:** AWS
- **Monitoring:** Sentry
- **VCS:** GitHub (main) + GitLab (legacy, migration in progress)
""",
    },
    {
        "path": "infra/aws",
        "title": "AWS Infrastructure",
        "category": "infra",
        "source_provider": "aws",
        "content": """# AWS Infrastructure

**Account:** 891234567890
**Region:** us-west-2

## Compute
| Resource | Type | Purpose |
|----------|------|---------|
| EKS cluster | 5x m6i.large | API + pipeline workers |
| Lambda | 12 functions | Event handlers |

## Database
| Resource | Type | Purpose |
|----------|------|---------|
| RDS PostgreSQL | db.r6g.large | Primary DB |
| ClickHouse (EC2) | r6i.2xlarge | Analytics queries |
| ElastiCache Redis | cache.t4g.medium | Job queue + cache |

## Storage
- S3 (dataflow-ingestion): 800GB — raw data intake
- S3 (dataflow-processed): 1.2TB — processed outputs

## Monthly Cost: ~$3,200
""",
    },
    {
        "path": "security/index",
        "title": "Security",
        "category": "security",
        "source_provider": "sentry",
        "content": """# Security

## Error Tracking (Sentry)
- 3 projects: api (Go), workers (Python), frontend (React)
- ~500 events/week, 12 unresolved issues
- Alert rules: new issue → Slack, regression → PagerDuty

## Auth
- Auth0 for customer authentication
- API keys for programmatic access (SHA-256 hashed)
- Service accounts for internal services (short-lived JWT)
""",
    },
]

DIRECTORY_DATA = {
    "startup": STARTUP_ENTRIES,
    "enterprise": ENTERPRISE_ENTRIES,
    "agency": AGENCY_ENTRIES,
    "mixed": MIXED_ENTRIES,
}
