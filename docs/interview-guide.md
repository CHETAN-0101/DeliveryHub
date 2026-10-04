# DeliveryHub Interview Guide

This guide covers the key design decisions, trade-offs, and talking points for system design interviews.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Key Design Decisions](#key-design-decisions)
3. [Deep Dive Questions](#deep-dive-questions)
4. [Scaling Scenarios](#scaling-scenarios)
5. [Failure Scenarios](#failure-scenarios)
6. [Future Improvements](#future-improvements)

---

## Architecture Overview

**DeliveryHub** is a microservices platform for delivery management with:
- 6 microservices (3 Java, 3 Go)
- Event-driven architecture with Kafka
- Database-per-service pattern
- Redis for geo-spatial and caching
- Full observability stack

**Request Flow**: Client → API Gateway → Order Service → Kafka → Dispatch Service → Driver Service → Kafka → Notification Service

---

## Key Design Decisions

### Why Microservices?

**Context**: Need independent deployment, scaling, and technology choices for different domain concerns.

**Decision**: Decompose by business capability:
- Order Service: Core business logic, transactions
- Driver Service: High-concurrency location updates
- Dispatch Service: Assignment logic, stateless workers
- Notification Service: Template rendering, multi-channel
- AI Service: ML inference, read-only predictions
- API Gateway: Cross-cutting concerns

**Alternatives Considered**:
- Modular monolith: Simpler but limits independent scaling/deployment
- Serverless: Cold starts problematic for low-latency assignment

**Consequences**:
- + Independent deployments, technology diversity, team autonomy
- - Operational complexity, distributed transactions, network latency

---

### Why Java AND Go?

**Context**: Different services have different performance and ecosystem requirements.

**Decision**: Polyglot by design:
- **Java (Spring Boot)**: Order Service, Notification Service
  - Strong transaction support, JPA, validation, enterprise ecosystem
  - Mature Kafka/Spring integration
  - Team expertise
- **Go**: API Gateway, Driver Service, Dispatch Service, AI Service
  - High concurrency (goroutines) for location updates
  - Low latency, small memory footprint
  - Native Redis Geo, gRPC support
  - Single binary deployment

**Alternatives Considered**:
- All Java: Simpler but heavier for high-throughput services
- All Go: Less mature for complex business logic/transactions
- Node.js: Good middle ground but less type safety

---

### Why Kafka for Async Events?

**Context**: Need reliable, ordered, replayable event delivery between services.

**Decision**: Apache Kafka (KRaft mode)
- **Durability**: Replicated log, configurable acks=all
- **Ordering**: Per-partition ordering by aggregate ID
- **Replayability**: Consumer groups, offset management
- **Throughput**: Handles high event volumes
- **Ecosystem**: Connect, Streams, Schema Registry

**Alternatives Considered**:
- RabbitMQ: Lower throughput, no replay, complex clustering
- AWS SQS/SNS: Vendor lock-in, limited ordering
- gRPC streaming: Not durable, no replay

**Consequences**:
- + Reliable event backbone, audit trail, debuggability
- - Operational complexity, ZooKeeper/KRaft, schema management

---

### Why Database-per-Service?

**Context**: Services must own their data and evolve independently.

**Decision**: Each service has its own PostgreSQL database
- Order Service → `order_db`
- Driver Service → `driver_db`
- Notification Service → `notification_db`

**No shared databases** - enforces loose coupling

**Alternatives Considered**:
- Shared database: Simpler joins but tight coupling, schema conflicts
- Polyglot persistence: More complexity, no clear benefit

**Consequences**:
- + Service autonomy, independent schema evolution, clear ownership
- - Distributed queries require API composition, eventual consistency

---

### Why Outbox Pattern?

**Context**: Must reliably publish events after database transaction without dual-write problems.

**Decision**: Transactional Outbox Pattern
```
DB Transaction:
  ├── UPDATE delivery SET status = ASSIGNED
  └── INSERT INTO outbox_events (aggregate_id, event_type, payload)
```
Separate publisher polls outbox → publishes to Kafka

**Alternatives Considered**:
- Direct Kafka produce in transaction: Not atomic, can lose events
- CDC (Debezium): More infrastructure, eventual consistency
- Saga with compensating transactions: Complex for simple events

**Consequences**:
- + Exactly-once semantics (with idempotent consumers), simple implementation
- - Additional table, polling latency (5s), publisher failure handling

---

### Why Redis for Driver Location?

**Context**: High-frequency location updates (1-5 Hz per driver), need geo queries.

**Decision**: Redis with Geo commands (GEOADD, GEORADIUS)
- **Performance**: In-memory, O(log N) geo queries
- **Atomic Operations**: SETNX for driver reservation
- **TTL Support**: Automatic expiry for stale locations
- **Pub/Sub**: Optional real-time updates

**Data Model**:
```
drivers:geo (Sorted Set) - GEOADD driver_id lon lat
driver:location:{id}:lat/lon/updated - String cache
driver:status:{id} - String (AVAILABLE/BUSY/OFFLINE)
driver:reservation:{id} - String with TTL (atomic reservation)
```

**Alternatives Considered**:
- PostGIS: ACID but slower for high-frequency writes
- Custom in-memory: Reinventing Redis poorly
- Time-series DB: Overkill for current location only

**Freshness Threshold**: 5 minutes (configurable)
- Drivers not updating location within threshold excluded from assignment

---

### Why REST Externally, gRPC Internally?

**Context**: Different requirements for external vs internal communication.

**Decision**:
- **External (Client ↔ Gateway)**: REST/JSON
  - Universal client support, firewall-friendly, debugging
  - OpenAPI documentation, versioning in URL
- **Internal (Dispatch ↔ Driver)**: gRPC/Protobuf
  - Low latency, contract-first, streaming support
  - Code generation, strict typing

**Services Using gRPC**:
- Dispatch Service → Driver Service (ReserveDriver, GetDriverLocation)
- Future: Order Service ↔ Notification Service

**Alternatives Considered**:
- All REST: Simpler but higher latency, no streaming
- All gRPC: Browser support requires proxy, debugging harder
- GraphQL: Overkill for internal RPC

---

### Why Keycloak/OIDC?

**Context**: Need standard, battle-tested authentication with fine-grained roles.

**Decision**: Keycloak as Identity Provider
- **Standards**: OIDC/OAuth2/JWT - interoperable
- **Features**: SSO, MFA, social login, user federation
- **Operations**: Admin console, realms, clients, scopes
- **Integration**: Spring Security, Go JWT libraries

**Alternatives Considered**:
- Custom auth: Don't roll your own crypto
- Auth0/Clerk: Vendor lock-in, cost at scale
- OAuth2 Proxy: Only gateway, no user management

---

### Why AI Provider Abstraction?

**Context**: AI/ML landscape changes rapidly; need to swap providers without code changes.

**Decision**: `AIProvider` interface with implementations:
```go
type AIProvider interface {
    PredictETA(ctx, req) (ETAResponse, error)
    AnalyzeRisk(ctx, req) (RiskResponse, error)
    AskAssistant(ctx, req) (AssistantResponse, error)
}
```

**Implementations**:
- `MockAIProvider`: Deterministic algorithm, no external deps
- `ExternalAIProvider`: HTTP client for OpenAI/Anthropic/etc.

**Configuration**: `AI_PROVIDER=MOCK|EXTERNAL` env var

**Consequences**:
- + Easy testing, provider swap, cost control
- - Interface must be stable, mock must be realistic

---

## Deep Dive Questions

### Q: How is duplicate delivery creation prevented?

**Answer**: Idempotency Keys at API Gateway + Database Constraint

1. Client sends `Idempotency-Key: unique-key` header
2. Gateway forwards to Order Service
3. Order Service:
   - Computes SHA-256 hash of request body
   - Checks `idempotency_records` table for key
   - If found with same hash → return cached response (200 OK)
   - If found with different hash → 409 Conflict
   - If not found → create delivery, store key+hash+response
4. **Database Constraint**: `PRIMARY KEY (idempotency_key)` enforces uniqueness
5. **TTL**: Records expire after 24 hours (configurable)

**Why not just application check?**: Race condition between check and insert. Database constraint is the source of truth.

---

### Q: How is duplicate Kafka processing handled?

**Answer**: Idempotent Consumers + Event ID Tracking

1. **Event ID**: Every event has unique `eventId` (UUID v4)
2. **Consumer-side deduplication**:
   ```go
   // Redis SET with TTL
   processed, _ := redis.SetNX(ctx, "processed:"+eventId, "1", 24*time.Hour).Result()
   if !processed {
       return // Already processed
   }
   ```
3. **Natural idempotency**: State transitions are idempotent
   - Setting status to `ASSIGNED` twice = no-op
   - Creating notification twice = duplicate but harmless (deduped by template+delivery+channel)

4. **Exactly-once semantics**: Kafka `enable.idempotence=true` + consumer deduplication

---

### Q: What happens if Kafka is unavailable?

**Answer**: Outbox Pattern Provides Durability

1. **Order Service**: Events written to `outbox_events` table in same DB transaction as business data
2. **Outage Duration**: Events accumulate in outbox table
3. **Publisher**: Polls every 5s, retries with exponential backoff
4. **Recovery**: When Kafka returns, publisher drains backlog automatically
5. **No Data Loss**: Events persisted in PostgreSQL (ACID)

**Caveats**:
- Publishing latency increases during outage (bounded by poll interval + retry)
- Order Service remains available for writes
- Read replicas may lag

---

### Q: What happens if Driver Service is down?

**Answer**: Graceful Degradation with Retry/DLQ

**Dispatch Service**:
1. Consumes `DeliveryCreated` event
2. Calls Driver Service gRPC `ReserveDriver`
3. **Failure**: gRPC returns unavailable
4. **Retry**: Exponential backoff (1s, 2s, 4s, max 3 retries)
5. **DLQ**: After max retries, publish to `delivery.created.dlq`
6. **Alerting**: DLQ consumer alerts ops team

**API Gateway**:
- Circuit breaker (Resilience4j) opens after 50% failures in 10s
- Returns 503 with retry-after header
- Prevents cascade failures

**Driver Location Updates**:
- Mobile app queues locally, retries with exponential backoff
- No data loss on client side

---

### Q: What happens if notification fails?

**Answer**: Isolated Failure, No Impact on Delivery Workflow

1. Notification Service consumes event → creates notification record (PENDING)
2. **Async send** via `@Async` with retry:
   - Attempt 1: immediate
   - Attempt 2: 1s delay
   - Attempt 3: 4s delay
   - Max 3 attempts (configurable)
3. **Failure after retries**: Mark `FAILED`, store error message
4. **DLQ**: Failed notifications → `notification.dlq` for manual retry
5. **Delivery continues**: Order/Dispatch unaffected

**Monitoring**: Alert on `notification_failures_total` > threshold

---

### Q: How do you avoid assigning one driver to two deliveries?

**Answer**: Atomic Redis Reservation with TTL

```go
// Single atomic operation
success, err := redis.SetNX(ctx, 
    "driver:reservation:"+driverID, 
    deliveryID, 
    5*time.Minute).Result()

if success {
    // Got reservation, proceed with assignment
} else {
    // Driver already reserved, try next driver
}
```

**Why this works**:
- `SETNX` is atomic in Redis (single-threaded)
- TTL auto-releases if assignment fails/crashes
- No distributed lock service needed
- Handles network partitions (lock expires)

**Race Condition Scenario**:
```
Dispatch Worker 1          Dispatch Worker 2
      │                         │
      ├─ Find driver A          │
      │                         ├─ Find driver A
      ├─ SETNX driver A ✓       │
      │                         ├─ SETNX driver A ✗ (already set)
      ├─ Assign driver A        │
      │                         └─ Try driver B
```

---

## Scaling Scenarios

### Q: How would this scale to 1M drivers?

**Driver Service**:
- **Redis Cluster**: Hash slots across shards, `GEOADD`/`GEORADIUS` work with cluster (single key)
- **Connection Pooling**: PgBouncer for PostgreSQL
- **Read Replicas**: For driver lookup queries
- **Partitioning**: By geographic region (geohash prefix)

**Dispatch Service**:
- **Kafka Partitions**: Increase `delivery.created` partitions to 100+
- **Consumer Groups**: Horizontal scaling, each partition → one consumer
- **Stateless**: Add more dispatch workers

**API Gateway**:
- Horizontal scaling (stateless)
- Redis for rate limit state (cluster mode)
- NGINX/Envoy in front for L4 load balancing

**Database**:
- **Order Service**: Shard by `customer_id` (consistent hashing)
- **Driver Service**: Shard by `region_id` or `geohash`
- **Read Models**: Materialized views for common queries

---

### Q: How would you partition Kafka?

**Strategy**: By Aggregate ID (Delivery ID / Driver ID)

```java
// Producer partitioner
partition = Math.abs(deliveryId.hashCode()) % numPartitions
```

**Benefits**:
- All events for same delivery → same partition → ordered
- All events for same driver → same partition
- Even distribution with good hash

**Partition Count**: Start with 3x expected max consumers (e.g., 30 for 10 consumers)

**Replication**: 3x for production, 1x for dev

---

### Q: How would you shard PostgreSQL?

**Order Service**: By `customer_id`
```sql
-- Consistent hashing
shard = hash(customer_id) % num_shards
```

**Driver Service**: By geographic region
```sql
-- Geohash prefix (e.g., 5 chars ≈ 5km x 5km)
shard = geohash(lat, lon, 5)
```

**Cross-shard queries**: API Gateway fans out, aggregates results

**Migration**: Dual-write during transition, then cutover

---

### Q: How would you improve driver matching?

**Current**: Simple nearest-available with freshness filter

**Improvements**:
1. **Multi-factor scoring**:
   ```
   score = w1*distance + w2*rating + w3*acceptance_rate + w4*vehicle_match + w5*freshness
   ```

2. **ML-based ranking** (replace in AI Service):
   - Features: Historical acceptance, completion time, driver preferences
   - Model: Gradient boosting / neural net
   - A/B testing framework

3. **Batch assignment**: Collect deliveries for 30s, optimize globally (Hungarian algorithm)

4. **Predictive positioning**: Move drivers to predicted demand zones

---

### Q: How would you replace MockAIProvider with real model?

**Steps**:
1. **Model Training**: Offline pipeline (historical data → features → training)
2. **Model Serving**: TensorFlow Serving / Triton / BentoML / Sagemaker
3. **ExternalAIProvider**: Implement HTTP/gRPC client with:
   - Request/response transformation
   - Timeout/circuit breaker
   - Fallback to mock on failure
4. **Feature Store**: Redis/Feast for real-time features
5. **Monitoring**: Prediction latency, drift detection, A/B testing
6. **Rollout**: Canary → 10% → 50% → 100%

**Interface Stability**: Keep `AIProvider` interface unchanged

---

## Failure Scenarios

| Scenario | Detection | Mitigation |
|----------|-----------|------------|
| Kafka broker down | Health check, consumer lag alert | ISR reassignment, producer retries |
| Redis master failover | Sentinel/Cluster auto-failover | Client retry, connection pooling |
| PostgreSQL primary down | Patroni/Repmgr auto-failover | Read replicas, connection retry |
| Network partition | Circuit breaker, timeout | Graceful degradation, queue locally |
| Dependency cascade | Bulkhead pattern, rate limiting | Isolate failures, fail fast |
| Clock drift | NTP monitoring | Logical clocks for ordering |

---

## Future Improvements

### Short Term (1-3 months)
1. **Schema Registry**: Avro/Protobuf for Kafka events
2. **Distributed Tracing**: Full OpenTelemetry instrumentation
3. **Load Testing**: k6 scripts for 10K req/s baseline
4. **Chaos Engineering**: Litmus/Gremlin experiments
5. **API Versioning**: Deprecation policy, sunset headers

### Medium Term (3-6 months)
1. **CQRS**: Read models for common queries (delivery tracking)
2. **Event Sourcing**: For delivery aggregate (audit, replay)
3. **ML Pipeline**: Feature store, training pipeline, model registry
4. **Multi-region**: Active-active with conflict resolution
5. **GraphQL Gateway**: For flexible client queries

### Long Term (6-12 months)
1. **Service Mesh**: Istio for mTLS, traffic management
2. **Serverless Burst**: Knative for notification/AI spikes
3. **Real-time UI**: WebSocket gateway for live tracking
4. **Advanced AI**: Route optimization, demand forecasting
5. **Data Platform**: Lakehouse for analytics, ML features

---

## Interview Talking Points Summary

| Topic | Key Points |
|-------|------------|
| **Why Kafka?** | Durability, ordering, replay, throughput |
| **Why Outbox?** | Atomic DB + event, no dual-write |
| **Why Redis Geo?** | O(log N) queries, atomic ops, TTL |
| **Why polyglot?** | Right tool for each job |
| **Idempotency?** | Key+hash at DB level, consumer dedup |
| **Consistency?** | Strong for state, eventual for derived |
| **Scaling?** | Horizontal stateless, partitioned stateful |
| **Failure?** | Circuit breaker, retry, DLQ, graceful degradation |

---

## Known Limitations

1. **No Frontend**: Backend-only, API-first
2. **Mock AI**: Deterministic, not real ML
3. **Single Region**: No multi-region DR
4. **No Service Mesh**: mTLS not enforced in dev
5. **Limited Testing**: Integration tests need Testcontainers
6. **No CI/CD Deploy**: Manual Kubernetes apply

---

## Questions for Interviewer

1. "What's your current scale and pain points?"
2. "How do you handle schema evolution in your event system?"
3. "What's your strategy for multi-region deployments?"
4. "How do you manage database migrations across services?"
5. "What's your approach to testing distributed systems?"