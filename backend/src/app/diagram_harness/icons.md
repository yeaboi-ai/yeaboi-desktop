# Icon Sets

## Inventory

| Set | Path | Count | Source | License |
|---|---|---|---|---|
| AWS | `aws/` | 390 | aws.amazon.com/architecture/icons | Free, attribution |
| GCP | `gcp/` | 216 | cloud.google.com/icons | Free, attribution |
| Azure | `azure/` | 683 | learn.microsoft.com/azure/architecture/icons | Free, terms of use |
| Generic tech | `tech/` | 7 | simpleicons.org | CC0 |

**CDN Base URL:** `https://pub-5eeb5465b11049d699b2b0afb00261be.r2.dev/`

Example: `https://pub-5eeb5465b11049d699b2b0afb00261be.r2.dev/aws/Compute/Arch_Amazon-EC2_48.svg`

## Most Used Icons (prioritize loading these)

### AWS (top 20)
EC2, S3, Lambda, RDS, DynamoDB, SQS, SNS, CloudFront, ALB, API Gateway,
ECS, Fargate, Aurora, ElastiCache, Cognito, CloudWatch, EventBridge, Route53,
VPC, IAM

### GCP (top 15)
Compute Engine, Cloud Run, Cloud Functions, Cloud SQL, BigQuery, Pub/Sub,
GKE, Cloud Storage, Cloud CDN, Firebase, Cloud IAM, Memorystore, Spanner,
Dataflow, Cloud Build

### Azure (top 15)
App Service, Azure Functions, Cosmos DB, Azure SQL, Service Bus, AKS,
Blob Storage, Front Door, API Management, Active Directory, Key Vault,
Container Instances, Logic Apps, Event Hub, Application Insights

### Generic Tech
PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ, Elasticsearch,
Nginx, Docker, Kubernetes, Terraform, GitHub Actions, GitLab CI,
Datadog, Grafana, Prometheus, Stripe, Twilio, SendGrid, Auth0

### Wireframe Components
Button, Input, Textarea, Checkbox, Radio, Select, Toggle, Card,
Modal, Sidebar, Header, Footer, Table, List, Avatar, Icon, Badge,
Tabs, Accordion, Image placeholder, Text block, Navigation bar

## Icon Usage in Diagrams

- Standard size: 48×48px within nodes (node is typically 200×80 minimum)
- Position: left-aligned within node, label to the right
- Color: use original icon colors on dark background, or white/monochrome variant
- Fallback: if icon not available, use emoji from `architecture.md` node type table
