# DevOps & Infrastructure Diagrams

## CI/CD Pipeline {#cicd}

**When:** Deployment discussed. Tier 2.
**Layout:** Strict L→R horizontal pipeline. Stages as boxes connected by arrows. Gates between stages.

**Structure:**
```
[Push] → [Build] → [Unit Test] → [Lint/SAST] → ◇ Gate → [Deploy Staging] → [Integration Test] → ◇ Gate → [Deploy Prod]
```

**Node types:**
| Stage type | Fill/Stroke |
|---|---|
| Build | #1c3a5e / #60a5fa |
| Test | #1a3a2a / #4ade80 |
| Security scan | #3d1515 / #f87171 |
| Deploy | #2d1f5e / #a78bfa |
| Gate/Approval | Diamond, #3d2e0a / #fbbf24 |

**Annotations:** Duration estimate per stage, environment labels, artifact names.
**Parallel stages:** Fork bar → parallel boxes → join bar.

## Deployment Strategy {#deployment}

**Blue-Green:**
```
[LB] ──→ [Blue (current v1)] ← live traffic
     ──→ [Green (new v2)]    ← standby, switch on approval
```

**Canary:**
```
[LB] ──90%──→ [v1 (stable)]
     ──10%──→ [v2 (canary)]   ← gradually increase %
```

**Rolling:**
```
[Instance 1: v2 ✓] [Instance 2: v1→v2...] [Instance 3: v1] [Instance 4: v1]
```

## Observability Architecture {#observability}

**Layout:** Three parallel paths (metrics, logs, traces) flowing L→R through: Instrumentation → Collection → Storage → Visualization → Alerting.

**Structure:**
```
[App + OTel SDK] ──metrics──→ [OTel Collector] → [Prometheus] → [Grafana] → [PagerDuty]
                 ──logs─────→ [Fluentd]        → [Loki]      ↗
                 ──traces───→ [OTel Collector] → [Tempo]     ↗
```

## GitOps Flow {#gitops}

**Structure:**
```
[Developer] → [Git Push] → [CI Build] → [Image Registry]
                                              │
[K8s Cluster] ←── reconcile ←── [ArgoCD/Flux] ←── watches ←── [Git Repo (manifests)]
```

## Infrastructure as Code {#iac}

**Layout:** Module dependency tree. Root module at top, child modules below, with resource blocks as leaves.
**Annotations:** Provider, state backend location, workspace/environment labels.
