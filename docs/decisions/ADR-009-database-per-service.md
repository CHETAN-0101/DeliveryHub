# ADR-009: Database-per-Service Pattern

## Status
Accepted

## Context
In a microservices architecture, data ownership must be clearly defined. Sharing databases between services creates tight coupling, schema conflicts, and deployment dependencies.

## Decision
Each microservice owns exactly one PostgreSQL database:
- **Order Service** → `order_db` (deliveries, events, outbox, idempotency)
- **Driver Service** → `driver_db` (drivers, locations, status history)
- **Notification Service** → `notification_db` (notifications, templates)

**No shared databases. No cross-service foreign keys. No direct database access.**

## Database Ownership

| Service | Database | Tables | Access |
|---------|----------|--------|--------|
| Order Service | `order_db` | `deliveries`, `delivery_events`, `outbox_events`, `idempotency_records` | Read/Write (own) |
| Driver Service | `driver_db` | `drivers`, `driver_locations`, `driver_status_history` | Read/Write (own) |
| Notification Service | `notification_db` | `notifications`, `notification_templates` | Read/Write (own) |
| API Gateway | - | - | None |
| Dispatch Service | - | - | None (uses Redis/Kafka) |
| AI Service | - | - | None (read-only via APIs) |

## Data Access Patterns

### Own Service (Read/Write)
```java
// Order Service - owns order_db
@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    // Full CRUD
}
```

### Other Services (API Only)
```go
// Dispatch Service - needs driver info
// WRONG: direct database access
// db.Query("SELECT * FROM driver_db.drivers WHERE id = ?")

// CORRECT: API call or gRPC
resp, _ := http.Get("http://driver-service:8082/api/v1/drivers/" + driverID)
```

### Read Models (Future)
For cross-service queries, build dedicated read models:
```
DeliveryTrackingView (materialized view)
├── delivery_id, status, driver_name, driver_location, eta
└── Updated via Kafka events from Order + Driver services
```

## Alternatives Considered

### Shared Database (Single PostgreSQL Instance)
**Pros**: 
- Simple joins, ACID transactions across entities
- Single backup/monitoring point
- Lower resource usage

**Cons**: 
- **Schema Coupling**: Order Service migration breaks Driver Service
- **Deployment Coupling**: Must deploy all services together
- **Scaling**: Can't scale databases independently
- **Team Friction**: Schema ownership conflicts
- **Failure Domain**: DB outage takes down entire platform

### Shared Database with Schemas
**Pros**: Some isolation, single instance
**Cons**: 
- Still shared hardware, connection pool, backup
- Cross-schema queries tempting
- Migration coordination required

### Polyglot Persistence (Different DB per Service)
**Pros**: Best tool for each job
**Cons**: 
- Operational complexity (PostgreSQL + MongoDB + Cassandra + Redis)
- Team expertise fragmentation
- No standard tooling/backup/monitoring

### Event Sourcing / CQRS
**Pros**: Complete audit trail, temporal queries, replay
**Cons**: 
- Complexity overkill for current requirements
- Event schema evolution challenges
- Projection rebuilding complexity

## Consequences

### Positive
- **Service Autonomy**: Each team controls their schema, migrations, scaling
- **Failure Isolation**: `driver_db` outage doesn't affect `order_db`
- **Independent Scaling**: Scale `order_db` read replicas separately from `driver_db`
- **Technology Freedom**: Could swap `driver_db` to Cassandra later
- **Clear Ownership**: No ambiguity about who owns what data
- **Security**: Least privilege - services only access their DB

### Negative
- **No Cross-Service Joins**: Must use API composition or async events
- **Distributed Transactions**: No ACID across services (use Saga/Outbox)
- **Data Duplication**: Some reference data duplicated (e.g., driver name in notification)
- **Consistency**: Eventual consistency by default
- **Operational Overhead**: Multiple DB instances to monitor, backup, patch

## Data Consistency Model

| Operation | Consistency | Mechanism |
|-----------|-------------|-----------|
| Delivery state change | Strong | PostgreSQL ACID + Optimistic Lock |
| Driver assignment | Eventual | Kafka + Redis atomic reservation |
| Driver location | Eventual | Redis (primary), PostgreSQL (async) |
| Notifications | Eventual | Kafka consumer with retry |
| AI Predictions | Eventual | Read-only, cached |

## Handling Cross-Service Queries

### API Composition (Gateway)
```go
// Gateway aggregates
func getDeliveryWithDriver(deliveryID string) {
    delivery := callOrderService(deliveryID)
    if delivery.DriverID != nil {
        driver := callDriverService(delivery.DriverID)
        return combine(delivery, driver)
    }
    return delivery
}
```

### Async Materialized Views
```
Kafka: delivery.assigned → Notification Service → materialized view
Kafka: driver.location.updated → Tracking Service → real-time view
```

### Saga for Distributed Transactions
```
Create Delivery (Order DB)
    ↓ Kafka: DeliveryCreated
Assign Driver (Redis reservation + Driver DB)
    ↓ Kafka: DriverAssigned
Send Notification (Notification DB)
```

## Migration Strategy

### Adding New Service
1. Provision new PostgreSQL database
2. Configure service with own connection pool
3. Run Flyway migrations
4. No existing service affected

### Schema Changes
```sql
-- Service owns migration
-- V2__Add_driver_rating.sql (in driver-service)
ALTER TABLE drivers ADD COLUMN rating DECIMAL(3,2) DEFAULT 5.0;
```

### Data Migration (Cross-Service)
1. New field in target service
2. Backfill via API or one-time script
3. Dual-write during transition
4. Cutover read path

## Monitoring & Operations

### Per-Database Metrics
- Connection pool usage
- Query latency (p50, p95, p99)
- Active connections
- Replication lag (if replicas)
- Disk usage, vacuum status

### Backup Strategy
- **Per-Database**: Independent pg_dump schedules
- **Point-in-Time Recovery**: WAL archiving per DB
- **Cross-DB Consistency**: Not required (eventual consistency)

### Disaster Recovery
- Each DB restored independently
- Event replay from Kafka for derived data
- RPO: 5min (WAL), RTO: 30min

## Related ADRs
- ADR-001: Microservices (autonomy principle)
- ADR-004: Outbox Pattern (reliable events from DB)
- ADR-003: Kafka (async communication instead of joins)
- ADR-005: Redis (Driver Service uses Redis + PostgreSQL)