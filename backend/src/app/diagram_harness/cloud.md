# Cloud Architecture Diagrams

## General Cloud Layout

**Boundary nesting (outside → inside):**
```
Region (solid gray boundary, labeled "us-east-1")
  └─ VPC (solid blue boundary, labeled with CIDR)
       ├─ Public Subnet (green dashed, labeled "public 10.0.1.0/24")
       │    ├─ [Internet Gateway]
       │    ├─ [ALB / Load Balancer]
       │    └─ [NAT Gateway]
       └─ Private Subnet (orange dashed, labeled "private 10.0.2.0/24")
            ├─ [App Servers / ECS / Lambda]
            ├─ [Database (RDS/Aurora)]
            └─ [Cache (ElastiCache/Redis)]
```

**Layout:** Internet/users at top → public subnet → private subnet → data tier at bottom. External services (S3, SQS, SNS) outside VPC boundary to the right.

## AWS Architecture {#aws}

**Icons:** `public/icons/aws/` — use official AWS Architecture Icons.
**Node format:** AWS icon (48×48) + service name below. Group related services.

**Common patterns:**
```
[CloudFront] → [ALB] → [ECS/Fargate] → [RDS Aurora]
                                      → [ElastiCache]
                        [Lambda] ← [SQS] ← [SNS]
                                          ← [EventBridge]
[S3]  [DynamoDB]  [Cognito]  [CloudWatch]
```

**Must annotate:** Instance types, storage sizes, AZ placement, security group rules.

## GCP Architecture {#gcp}

**Icons:** `public/icons/gcp/`
**Boundary terms:** Project (not VPC as primary), VPC Network, Subnet.
**Key services:** Cloud Run, Cloud Functions, BigQuery, Pub/Sub, Cloud SQL, GKE, Cloud Storage.

## Azure Architecture {#azure}

**Icons:** `public/icons/azure/`
**Boundary terms:** Resource Group, Virtual Network, Subnet.
**Key services:** App Service, Azure Functions, Cosmos DB, Service Bus, Azure SQL, AKS, Blob Storage.

## Multi-Cloud / Hybrid {#multi-cloud}

**Layout:** Provider boundaries as large colored regions side-by-side. Interconnects between them.
**Boundaries:** AWS = orange region, GCP = blue region, Azure = cyan region, On-prem = gray region.
**Connections:** VPN/Direct Connect lines between regions, labeled with bandwidth/latency.

## VPC / Subnet Diagram {#vpc}

**Layout:** VPC as outer boundary. Subnets as inner boundaries arranged T→B (public top, private bottom).
**Must show:** Route tables (small annotation boxes), NACL rules, security groups (as dashed circles around instances).
**AZ visualization:** Vertical columns for each AZ, subnets within AZs.

```
                    VPC 10.0.0.0/16
    ┌──────── AZ-a ────────┬──────── AZ-b ────────┐
    │ ┌─ Public 10.0.1/24─┐│┌─ Public 10.0.3/24──┐│
    │ │ [ALB]  [NAT]       │││ [ALB]  [NAT]       ││
    │ └────────────────────┘│└─────────────────────┘│
    │ ┌─ Private 10.0.2/24┐│┌─ Private 10.0.4/24─┐│
    │ │ [App]  [App]       │││ [App]  [App]        ││
    │ └────────────────────┘│└─────────────────────┘│
    │ ┌─ Data 10.0.5/24───┐│┌─ Data 10.0.6/24────┐│
    │ │ [RDS Primary]      │││ [RDS Replica]       ││
    │ └────────────────────┘│└─────────────────────┘│
    └───────────────────────┴───────────────────────┘
```

## Kubernetes Architecture {#k8s}

**Layout:** Cluster boundary → Node pools → Pods grouped by deployment.
**Structure:**
```
[Ingress Controller]
        │
┌─── Cluster ──────────────────────────────┐
│  ┌─ Node Pool: apps ─────────────────┐   │
│  │ [Pod: frontend ×3] [Pod: api ×3]  │   │
│  │ [Pod: worker ×2]                   │   │
│  └────────────────────────────────────┘   │
│  ┌─ Node Pool: data ─────────────────┐   │
│  │ [StatefulSet: postgres]            │   │
│  │ [StatefulSet: redis]               │   │
│  └────────────────────────────────────┘   │
│  [ConfigMap]  [Secret]  [PVC]             │
└───────────────────────────────────────────┘
```
