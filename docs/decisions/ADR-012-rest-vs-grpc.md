# ADR-012: REST vs gRPC Communication

## Status
Accepted

## Context
DeliveryHub has two communication planes with different requirements:
1. **External**: Client applications → API Gateway
2. **Internal**: Service-to-service (Dispatch ↔ Driver, future integrations)

## Decision
| Plane | Protocol | Serialization | Transport |
|-------|----------|---------------|-----------|
| **External** (Client → Gateway) | REST | JSON | HTTP/1.1 (HTTP/2 capable) |
| **Internal** (Service ↔ Service) | gRPC | Protobuf | HTTP/2 |

## External: REST/JSON

### Why REST?
| Requirement | REST Fit |
|-------------|----------|
| Universal clients | ✅ Every platform has HTTP client |
| Firewalls/proxies | ✅ Standard ports 80/443 |
| Debugging | ✅ curl, Postman, browser devtools |
| Caching | ✅ HTTP caching (ETag, Cache-Control) |
| Versioning | ✅ `/api/v1/`, `/api/v2/` in URL |
| Documentation | ✅ OpenAPI/Swagger ecosystem |
| CDN/WAF | ✅ Standard HTTP semantics |

### Design Principles
- **Resource-oriented**: `POST /deliveries`, `GET /deliveries/{id}`
- **Standard verbs**: GET, POST, PATCH, DELETE
- **Status codes**: 200, 201, 400, 401, 403, 404, 409, 429, 500
- **Error format**: RFC 9457 Problem Details
- **Pagination**: `?page=0&size=20` with envelope
- **Idempotency**: `Idempotency-Key` header
- **OpenAPI**: Auto-generated docs at `/api/docs`

## Internal: gRPC/Protobuf

### Why gRPC?
| Requirement | gRPC Fit |
|-------------|----------|
| Low latency | ✅ Binary Protobuf, HTTP/2 multiplexing |
| Contract-first | ✅ `.proto` files, code generation |
| Streaming | ✅ Unary, server/client/bidi streaming |
| Type safety | ✅ Generated stubs, compile-time validation |
| Performance | ✅ 5-10x faster than REST/JSON |
| Deadlines/cancellation | ✅ Native `context.Context` propagation |

### Services Using gRPC
| Caller | Callee | Method | Reason |
|--------|--------|--------|--------|
| Dispatch | Driver | `ReserveDriver` | Low latency, atomic |
| Dispatch | Driver | `GetDriverLocation` | Real-time streaming ready |
| Future | Order/Notification | `SendNotification` | Async streaming batch |

### Protobuf Example
```protobuf
syntax = "proto3";
package deliveryhub.driver;

service DriverService {
  rpc ReserveDriver(ReserveDriverRequest) returns (ReserveDriverResponse);
  rpc GetDriverLocation(GetDriverLocationRequest) returns (GetDriverLocationResponse);
}

message ReserveDriverRequest {
  string driver_id = 1;
  string delivery_id = 2;
}

message ReserveDriverResponse {
  bool success = 1;
  string message = 2;
}
```

## Communication Matrix

| Path | Protocol | Serialization | Purpose |
|------|----------|---------------|---------|
| Client → Gateway | REST | JSON | Public API |
| Gateway → Order | REST | JSON | Delivery CRUD |
| Gateway → Driver | REST | JSON | Driver management |
| Gateway → Dispatch | REST | JSON | Manual triggers |
| Gateway → Notification | REST | JSON | History query |
| Gateway → AI | REST | JSON | Predictions |
| **Dispatch → Driver** | **gRPC** | **Protobuf** | **Reserve, location** |

## Alternatives Considered

### All REST
**Pros**: Uniform, simple tooling
**Cons**: Higher latency (JSON parsing), no streaming, no compile-time contracts

### All gRPC
**Pros**: Consistent, fast
**Cons**: Browser needs gRPC-Web proxy, harder debugging, firewall issues

### GraphQL
**Pros**: Flexible queries
**Cons**: Complexity, N+1 queries, caching harder

### Message Queue Only
**Pros**: Decoupled, durable
**Cons**: Not request-response, higher latency for sync needs

## Consequences

### Positive
- **External Flexibility**: Any client integrates easily
- **Internal Performance**: 5-10x lower latency for service calls
- **Contract Safety**: Protobuf prevents breaking changes
- **Streaming Ready**: Can add real-time location streaming

### Negative
- **Two Protocols**: Team must know both
- **Gateway Complexity**: Translates REST ↔ gRPC
- **Debugging**: Binary Protobuf harder to inspect
- **Tooling**: Need `protoc`, language plugins

## Implementation

### Java (Spring Boot)
```java
@GrpcService
public class DriverGrpcService extends DriverServiceGrpc.DriverServiceImplBase { ... }

@Bean
public ManagedChannel driverServiceChannel() {
    return ManagedChannelBuilder.forAddress("driver-service", 9092)
        .usePlaintext().build();
}
```

### Go
```go
grpcServer := grpc.NewServer()
driverpb.RegisterDriverServiceServer(grpcServer, &DriverServer{})

conn, _ := grpc.DialContext(ctx, "driver-service:9092", grpc.WithTransportCredentials(insecure.NewCredentials()))
client := driverpb.NewDriverServiceClient(conn)
```

## Observability
- **REST**: OpenTelemetry HTTP instrumentation
- **gRPC**: OpenTelemetry gRPC interceptors
- **Correlation**: `traceparent` header propagated in both

## Security
- **External**: JWT in Authorization header (validated at Gateway)
- **Internal**: mTLS (prod), service-to-service JWT (dev), header propagation

## Related ADRs
- ADR-002: Polyglot (Go for gRPC services)
- ADR-003: Kafka (async alternative)
- ADR-007: Keycloak (JWT validation)