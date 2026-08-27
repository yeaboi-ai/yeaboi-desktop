# Data Diagrams

## Entity-Relationship Diagram (ERD) {#erd}

**When:** Database/models discussed. Tier 1.
**Layout:** Primary entities in a horizontal row. Junction/join tables between the entities they connect. Group by domain (user domain left, order domain center, product domain right).

**Node format:** Table box with sections:
```
┌──────────────────┐
│  TABLE_NAME      │  ← header, bold, colored by domain
├──────────────────┤
│ id         PK    │  ← primary key indicator
│ name       text  │
│ email      text  │  ← column : type
│ org_id     FK    │  ← foreign key indicator
│ created_at ts    │
└──────────────────┘
```

**Header colors by domain:**
| Domain | Header fill/stroke |
|---|---|
| User/Auth | #1c3a5e / #60a5fa |
| Core business | #1a3a2a / #4ade80 |
| Transaction | #3d2e0a / #fbbf24 |
| Config/Lookup | #1c1c1c / #858585 |
| Junction/Join | #2d1f5e / #a78bfa |

**Relationships (Crow's Foot):**
- `──||──` one-to-one (solid lines both ends)
- `──|<──` one-to-many (line end, crow's foot end)
- `──o|──` zero-or-one (circle + line)
- `──o<──` zero-or-many (circle + crow's foot)
- Label FK column name on the line

**Anti-patterns:** Crossing lines (rearrange tables), >10 tables (split into domain sub-diagrams), missing FK labels.

## Data Flow Diagram (DFD) {#dfd}

**Layout:** External entities at edges (top/bottom/sides), processes center, data stores along bottom row.
**Shape mapping:**
| Element | Shape | Example |
|---|---|---|
| External entity | Rectangle, gray | "Customer", "Payment Provider" |
| Process | Rounded rectangle, numbered | "1.0 Process Order" |
| Data store | Open-ended rectangle (parallel lines) | "D1 Orders" |
| Data flow | Labeled arrow | "order_details" |

**Levels:** Start with L0 (one process bubble, all external entities). Decompose into L1 when details emerge.

## Data Pipeline / ETL {#pipeline}

**Layout:** Strict L→R: Sources → Ingest → Transform → Store → Serve.
**Medallion colors:** Raw=#3d1515/#f87171, Cleansed=#3d2e0a/#fbbf24, Curated=#1a3a2a/#4ade80.
**Annotations:** Volume (rows/day), freshness (real-time/hourly/daily), format (JSON/Parquet/Avro).

**Structure:**
```
[MySQL] ──→ [Kafka] ──→ [Spark/dbt] ──→ [Warehouse] ──→ [Grafana]
[S3 CSV] ──↗            (transform)     (gold layer)     [API]
[API]    ──↗                                             [BI Tool]
```

## Database Schema {#schema}

Same as ERD but with more implementation detail: indexes, constraints, triggers, default values, nullable markers.
Add index annotations below tables:
```
idx_users_email (UNIQUE)
idx_orders_user_id_created (COMPOSITE)
```
