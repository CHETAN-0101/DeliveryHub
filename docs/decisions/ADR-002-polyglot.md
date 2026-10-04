# ADR-002: Why Java and Go (Polyglot)

## Status
Accepted

## Context
Different services in DeliveryHub have fundamentally different performance profiles and ecosystem requirements. A single language would force compromises.

## Decision
Use a polyglot approach with two languages:
- **Java 21 + Spring Boot 3.2**: Order Service, Notification Service
- **Go 1.22**: API Gateway, Driver Service, Dispatch Service, AI Service

## Service-to-Language Mapping

| Service | Language | Rationale |
|---------|----------|-----------|
| Order Service | Java | Complex state machine, JPA/Hibernate, validation, transaction management, Spring Kafka integration |
| Notification Service | Java | Template engine (Thymeleaf/Freemarker), Spring scheduling for retries, Spring Kafka consumer |
| API Gateway | Go | High throughput, low latency, native HTTP/2, Gin framework, middleware chain |
| Driver Service | Go | High-frequency location updates (10K+ req/s), Redis Geo native, goroutines for concurrency |
| Dispatch Service | Go | Event-driven workers, Kafka consumer groups, low latency assignment, gRPC |
| AI Service | Go | Lightweight model serving, easy Python/ONNX integration, fast startup |

## Alternatives Considered

### All Java (Spring Boot)
**Pros**: Single stack, team expertise, Spring ecosystem, unified monitoring
**Cons**: 
- Driver Service: JVM overhead for 10K+ concurrent location connections
- API Gateway: Higher latency, larger memory footprint
- Dispatch Service: Thread-per-request model less efficient for event consumers

### All Go
**Pros**: Consistent tooling, single binary, fast startup, low memory
**Cons**: 
- Order Service: Less mature JPA equivalent, manual transaction management, verbose validation
- Notification Service: Weaker template engines, no Spring scheduling/retry abstraction
- Team Learning Curve: Java developers need Go training

### All Kotlin
**Pros**: JVM + modern syntax, coroutines for concurrency
**Cons**: Still JVM overhead for high-concurrency services, smaller ecosystem than Spring

### Node.js / TypeScript
**Pros**: Single language full-stack, good async model
**Cons**: No compile-time type safety for domain models, single-threaded event loop limitations, weaker enterprise libraries

## Consequences

### Positive
- **Right Tool for Job**: Each service uses optimal language
- **Performance**: Go services handle 10x more concurrent connections per CPU
- **Developer Experience**: Teams use familiar tools for their domain
- **Hiring Flexibility**: Can hire Java or Go specialists

### Negative
- **Operational Overhead**: Two build pipelines, two dependency ecosystems
- **Code Sharing**: Limited DTO/event sharing (use contracts repo)
- **Debugging**: Different profilers, debuggers, logging frameworks
- **Team Silos**: Risk of "Java team" vs "Go team" knowledge gaps
- **CI/CD Complexity**: Maven + Go toolchains

## Mitigation Strategies
- **Shared Contracts**: OpenAPI (REST), Protobuf (gRPC), JSON Schema (Kafka) in `contracts/`
- **Observability**: OpenTelemetry in both languages, unified dashboards
- **Standards**: Common logging format (JSON), error format (RFC 9457), health endpoints
- **Cross-training**: Pair programming, shared on-call rotation
- **Monorepo**: Single repo for atomic commits, shared tooling

## Language-Specific Standards

### Java (Spring Boot)
- Constructor injection, records for DTOs
- No Lombok (explicit is better)
- Spring Validation annotations
- Resilience4j for resilience patterns

### Go
- Standard library first, minimal frameworks
- Context propagation mandatory
- Explicit error handling
- Small interfaces, dependency injection via constructors
- golangci-lint for static analysis

## Related ADRs
- ADR-001: Microservices Architecture
- ADR-006: REST vs gRPC
- ADR-008: AI Provider Abstraction