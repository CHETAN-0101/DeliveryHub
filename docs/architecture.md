# DeliveryHub Architecture Documentation

## System Overview

DeliveryHub is a microservices-based delivery management platform that demonstrates production-grade distributed systems patterns. The system handles the complete delivery lifecycle from order creation to completion with real-time tracking, notifications, and AI-powered predictions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT APPLICATIONS                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY (Go)                               │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────────────┐  │
│  │ JWT Validate│ │ Rate Limit   │ │ Correlation │ │ Request Routing    │  │
│  └─────────────┘ └──────────────┘ └─────────────┘ └────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ ORDER SERVICE │         │DRIVER SERVICE │         │ AI SERVICE    │
│    (Java)     │         │    (Go)       │         │    (Go)       │
│               │         │               │         │               │
│ • Deliveries  │         │ • Drivers     │         │ • ETA Predict │
│ • State Machine           │ • Locations   │         │ • Risk Analysis
│ • Outbox      │         │ • Redis Geo   │         │ • Assistant   │
│ • Idempotency │         │ • gRPC        │         └───────────────┘
└───────┬───────┘         └───────┬───────┘
        │                         │
        │            ┌────────────┴────────────┐
        │            ▼                         ▼
        │    ┌───────────────┐         ┌───────────────┐
        │    │DISPATCH SERVICE│        │ REDIS         │
        │    │    (Go)       │         │               │
        │    │               │         │ • Driver Geo  │
        │    │ • Assignment  │         │ • Reservations│
        │    │ • Saga        │         │ • Rate Limit  │
        │    └───────┬───────┘         └───────────────┘
        │            │
        ▼            ▼
┌───────────────┐ ┌───────────────┐
│    KAFKA      │ │ NOTIFICATION  │
│               │ │   SERVICE     │
│ • Events      │ │    (Java)     │
│ • DLQ         │ │               │
└───────────────┘ └───────────────┘
```

## Service Responsibilities

### API Gateway (Go)
- **Purpose**: Single entry point for all client requests
- **Responsibilities**:
  - JWT validation and authentication
  - Rate limiting (token bucket algorithm)
  - Request/response correlation IDs
  - Request routing to backend services
  - Timeout and circuit breaker handling
  - Centralized error translation

### Order Service (Java/Spring Boot)
- **Purpose**: Core delivery management and state machine
- **Responsibilities**:
  - Delivery CRUD operations
  - State machine enforcement (CREATED → ASSIGNING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED/CANCELLED)
  - Optimistic locking for concurrency control
  - Outbox pattern for reliable event publishing
  - Idempotency key support for safe retries
  - PostgreSQL persistence

### Driver Service (Go)
- **Purpose**: Driver lifecycle and real-time location management
- **Responsibilities**:
  - Driver registration and profile management
  - Status transitions (OFFLINE → AVAILABLE → RESERVED → BUSY)
  - High-frequency location updates via Redis Geo
  - Atomic driver reservation using Redis SETNX
  - gRPC interface for internal communication
  - PostgreSQL for durable storage

### Dispatch Service (Go)
- **Purpose**: Driver assignment orchestration
- **Responsibilities**:
  - Consumes `DeliveryCreated` events from Kafka
  - Finds nearby available drivers using Redis Geo
  - Implements driver ranking algorithm (distance + availability + freshness)
  - Atomic driver reservation with TTL
  - Publishes `DriverAssigned` events
  - Handles assignment failures with retry/DLQ

### Notification Service (Java/Spring Boot)
- **Purpose**: Multi-channel notification delivery
- **Responsibilities**:
  - Consumes delivery lifecycle events
  - Renders notifications from templates
  - Supports EMAIL, SMS, PUSH channels
  - Exponential backoff retry logic
  - Dead letter queue for failed notifications
  - Template management

### AI Service (Go)
- **Purpose**: Intelligence layer for predictions and insights
- **Responsibilities**:
  - ETA prediction based on distance, traffic, driver position
  - Risk analysis for delivery delays
  - AI assistant for natural language queries
  - Provider abstraction (Mock/External)
  - Read-only access to business data

## Data Flow

### Create Delivery Flow
```
1. Client → POST /api/v1/deliveries (with Idempotency-Key)
2. API Gateway → Validates JWT, rate limits, generates correlation ID
3. Order Service → Creates delivery (status=CREATED), saves to PostgreSQL
4. Order Service → Writes DeliveryCreated event to Outbox table (same transaction)
5. Outbox Publisher → Polls Outbox, publishes to Kafka "delivery.created"
6. Dispatch Service → Consumes event, finds nearby drivers
7. Dispatch Service → Reserves driver atomically in Redis
8. Dispatch Service → Calls Driver Service gRPC to confirm assignment
9. Dispatch Service → Publishes DriverAssigned to Kafka
9. Notification Service → Consumes event, sends notification
10. Order Service → Updates delivery status to ASSIGNED
```

### Driver Location Update Flow
```
1. Driver App → POST /api/v1/drivers/{id}/location (high frequency)
2. API Gateway → Routes to Driver Service
3. Driver Service → Updates Redis Geo index (O(log N))
4. Driver Service → Updates Redis cache (lat/lon + timestamp)
5. Driver Service → Persists to PostgreSQL (async, batched)
6. Driver Service → Publishes DriverLocationUpdated to Kafka (optional)
```

### Delivery Completion Flow
```
1. Driver → PATCH /api/v1/deliveries/{id}/status (PICKED_UP → IN_TRANSIT → DELIVERED)
2. Order Service → Validates transition, updates state
3. Order Service → Writes status change event to Outbox
4. Outbox Publisher → Publishes to Kafka
5. Notification Service → Sends completion notification
6. AI Service → Can provide updated ETA/risk if queried
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| API Gateway | Go + Gin | High performance, low latency, native HTTP/2 |
| Order Service | Java + Spring Boot | Strong ecosystem for transactional business logic, JPA, validation |
| Driver Service | Go | High concurrency for location updates, Redis Geo native |
| Dispatch Service | Go | Event-driven, low latency for assignment |
| Notification Service | Java + Spring Boot | Template engine, retry logic, Spring Kafka integration |
| AI Service | Go | Lightweight, easy model serving integration |
| Message Broker | Apache Kafka (KRaft) | High throughput, durability, replayability |
| Cache/Geo | Redis | Geo spatial indexes, atomic operations, pub/sub |
| Database | PostgreSQL (per service) | ACID, JSONB, mature ecosystem |
| Auth | Keycloak (OIDC/JWT) | Standard protocol, SSO, fine-grained roles |
| Observability | OpenTelemetry + Prometheus + Grafana + Jaeger | Vendor-neutral, comprehensive |

## Consistency Model

| Operation | Consistency | Mechanism |
|-----------|-------------|-----------|
| Delivery state transitions | Strong | PostgreSQL ACID + Optimistic Locking |
| Driver assignment | Eventual | Kafka + Redis atomic reservation |
| Driver location | Eventual | Redis Geo (primary), PostgreSQL (async) |
| Notifications | Eventual | Kafka consumer with retry |
| AI predictions | Eventual | Read-only, cached |

## Scaling Strategy

| Service | Scaling Approach |
|---------|------------------|
| API Gateway | Horizontal (stateless), rate limit per instance |
| Order Service | Horizontal (read replicas), PostgreSQL primary |
| Driver Service | Horizontal, Redis Cluster for geo |
| Dispatch Service | Horizontal (Kafka consumer groups) |
| Notification Service | Horizontal (Kafka consumer groups) |
| AI Service | Horizontal (stateless), GPU nodes for ML models |

## Failure Handling

| Failure Scenario | Mitigation |
|-----------------|------------|
| Kafka unavailable | Outbox pattern ensures events not lost; local queue |
| Driver Service down | Dispatch retries with exponential backoff; DLQ |
| Notification fails | Exponential backoff (max 3 retries); DLQ; alerting |
| Database down | Circuit breaker; health checks; graceful degradation |
| AI service down | Fallback to deterministic algorithms; cached predictions |

## Security

- All service-to-service communication over mTLS (production)
- JWT validation at Gateway + each service
- Role-based access: CUSTOMER, DRIVER, DISPATCHER, ADMIN
- Secrets via Kubernetes Secrets / Vault
- Audit logging for all state changes
- Rate limiting at Gateway and per-service

## Observability

- **Metrics**: RED metrics (Rate, Errors, Duration) + business metrics
- **Logging**: Structured JSON with traceId, spanId, service name
- **Tracing**: Full distributed trace across all services
- **Alerting**: SLO-based alerts on error rate, latency, queue lag