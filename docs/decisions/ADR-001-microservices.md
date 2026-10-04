# ADR-001: Why Microservices Architecture

## Status
Accepted

## Context
DeliveryHub is a delivery management platform with multiple bounded contexts: order management, driver management, dispatch/logistics, notifications, and AI predictions. The system needs to support independent development, deployment, and scaling of these capabilities.

## Decision
Decompose the system into independently deployable microservices, each owning a single business capability:
- **Order Service**: Delivery lifecycle, state machine
- **Driver Service**: Driver profiles, locations, availability
- **Dispatch Service**: Assignment logic, saga orchestration
- **Notification Service**: Multi-channel notifications
- **AI Service**: ETA prediction, risk analysis
- **API Gateway**: Cross-cutting concerns (auth, rate limit, routing)

## Alternatives Considered

### Modular Monolith
Single deployable unit with internal module boundaries.

**Pros**: Simpler operations, no network latency, ACID transactions, easier debugging
**Cons**: Coupled deployments, single technology stack, scaling requires full replica, team contention

### Serverless Functions
Event-driven functions (AWS Lambda, Cloud Functions) for each operation.

**Pros**: Auto-scaling, pay-per-use, no server management
**Cons**: Cold starts (assignment latency), vendor lock-in, limited execution time, debugging complexity, connection pooling challenges

### Service-Oriented Architecture (SOA)
Larger services with shared enterprise service bus.

**Pros**: More coarse-grained, potentially simpler
**Cons**: ESB becomes bottleneck, shared contracts, tighter coupling

## Consequences

### Positive
- **Independent Deployment**: Services deploy on their own schedule
- **Technology Diversity**: Java for transactional services, Go for high-concurrency
- **Team Autonomy**: Teams own services end-to-end
- **Fault Isolation**: Failure in one service doesn't crash others
- **Scaling Granularity**: Scale dispatch workers independently from order service
- **Organizational Alignment**: Matches team boundaries (Conway's Law)

### Negative
- **Operational Complexity**: 6+ services to monitor, deploy, debug
- **Distributed Transactions**: No ACID across services, need saga/eventual consistency
- **Network Latency**: Inter-service calls add latency (mitigated by gRPC)
- **Data Consistency**: Eventual consistency by default, requires careful design
- **Testing Complexity**: Need contract tests, integration tests, chaos engineering
- **Schema Evolution**: Must maintain backward compatibility

## Mitigation Strategies
- **API Gateway**: Single entry point, hides internal topology
- **Observability**: OpenTelemetry distributed tracing, centralized logging
- **Contract Testing**: Pact/Kafka schema registry for consumer-driven contracts
- **Circuit Breakers**: Resilience4j (Java), custom (Go) for failure isolation
- **Database-per-Service**: Enforces loose coupling, clear ownership

## Related ADRs
- ADR-002: Why Java and Go
- ADR-003: Kafka for Async Events
- ADR-004: Outbox Pattern
- ADR-009: Database-per-Service