# ADR-006: REST for External, gRPC for Internal Communication

## Status
Accepted

## Context
DeliveryHub has two communication planes:
1. **External**: Client applications (mobile, web) → API Gateway
2. **Internal**: Service-to-service (Dispatch ↔ Driver, future Order ↔ Notification)

Different requirements drive different protocol choices.

## Decision
- **External APIs (Client ↔ Gateway)**: REST/JSON over HTTP/1.1 (with HTTP/2 support)
- **Internal RPC (Service ↔ Service)**: gRPC/Protobuf over HTTP/2

## REST for External APIs

### Why REST/JSON?
| Requirement | REST Fit |
|-------------|----------|
| Universal client support | ✅ Every language/platform has HTTP client |
| Firewall/proxy friendly | ✅ Standard ports (80/443), no special config |
| Debugging/inspection | ✅ Human-readable, curl/Postman/browser dev tools |
| Caching | ✅ HTTP caching semantics (ETag, Cache-Control) |
| Versioning | ✅ URL-based (`/api/v1/`, `/api/v2/`) |
| Documentation | ✅ OpenAPI/Swagger ecosystem |
| CDN/WAF integration | ✅ Standard HTTP headers |

### REST Design Principles
- **Resource-oriented**: `POST /deliveries`, `GET /deliveries/{id}`
- **Standard HTTP verbs**: GET, POST, PATCH, DELETE
- **Status codes**: 200, 201, 400, 401, 403, 404, 409, 429, 500
- **Error format**: RFC 9457 Problem Details
- **Pagination**: `?page=0&size=20` with `PageResponse` envelope
- **Idempotency**: `Idempotency-Key` header for safe retries

### OpenAPI Documentation
- Auto-generated from Spring Boot (Java) / manual (Go)
- Available at `/api/docs` on each service
- Contract testing with Pact

## gRPC for Internal Communication

### Why gRPC?
| Requirement | gRPC Fit |
|-------------|----------|
| Low latency | ✅ Binary Protobuf, HTTP/2 multiplexing |
| Contract-first | ✅ `.proto` files, code generation |
| Streaming | ✅ Unary, server/client/bidirectional streaming |
| Type safety | ✅ Generated stubs, compile-time validation |
| Performance | ✅ 5-10x faster than REST/JSON |
| Deadlines/cancellation | ✅ Native `context.Context` propagation |

### Services Using gRPC
| Caller | Callee | Method | Reason |
|--------|--------|--------|--------|
| Dispatch Service | Driver Service | `ReserveDriver` | Low latency, atomic reservation |
| Dispatch Service | Driver Service | `GetDriverLocation` | Real-time tracking |
| Future: Order Service | Notification Service | `SendNotification` | Async, streaming batch |

### Protobuf Schema (Example)
```protobuf
syntax = "proto3";

package deliveryhub.driver;

service DriverService {
  rpc GetDriver(GetDriverRequest) returns (GetDriverResponse);
  rpc GetDriverLocation(GetDriverLocationRequest) returns (GetDriverLocationResponse);
  rpc UpdateDriverStatus(UpdateDriverStatusRequest) returns (UpdateDriverStatusResponse);
  rpc ReserveDriver(ReserveDriverRequest) returns (ReserveDriverResponse);
  rpc ReleaseDriverReservation(ReleaseDriverReservationRequest) returns (ReleaseDriverReservationResponse);
}

message Driver {
  string id = 1;
  string name = 2;
  string phone = 3;
  string vehicle_type = 4;
  string status = 5;
  double current_latitude = 6;
  double current_longitude = 7;
  double rating = 8;
  int32 total_deliveries = 9;
}
```

## Communication Matrix

| Path | Protocol | Serialization | Use Case |
|------|----------|---------------|----------|
| Client → Gateway | REST | JSON | Public API |
| Gateway → Order | REST | JSON | Delivery CRUD |
| Gateway → Driver | REST | JSON | Driver management |
| Gateway → Dispatch | REST | JSON | Assignment triggers |
| Gateway → Notification | REST | JSON | Notification history |
| Gateway → AI | REST | JSON | Predictions |
| Dispatch → Driver | gRPC | Protobuf | Reserve, location |
| AI → Order/Driver | REST | JSON | Feature fetching |

## Alternatives Considered

### All REST
**Pros**: Uniform, simple, great tooling
**Cons**: 
- Higher latency for internal calls (JSON parsing, HTTP/1.1)
- No streaming for real-time updates
- No compile-time contract validation
- Verbose for high-frequency calls

### All gRPC
**Pros**: Consistent, fast, contract-first
**Cons**: 
- Browser support requires gRPC-Web/Envoy proxy
- Harder to debug (binary)
- Less familiar to frontend teams
- Firewall/proxy issues in some environments

### GraphQL
**Pros**: Flexible queries, single endpoint
**Cons**: 
- Complexity for simple CRUD
- N+1 query problems
- Caching harder
- Overkill for internal RPC

### Message Queue for Everything
**Pros**: Decoupled, durable
**Cons**: 
- Not request-response (fire-and-forget)
- Higher latency for synchronous needs
- Complex for query operations

## Consequences

### Positive
- **External Flexibility**: Any client can integrate
- **Internal Performance**: 5-10x lower latency for service calls
- **Contract Safety**: Protobuf prevents breaking changes
- **Streaming Ready**: Can add real-time location streaming later

### Negative
- **Two Protocols**: Team must know both
- **Gateway Complexity**: Translates REST ↔ gRPC
- **Debugging**: Binary Protobuf harder to inspect
- **Tooling**: Need `protoc`, language-specific plugins

## Implementation Details

### Java (Spring Boot)
```java
// gRPC Server
@GrpcService
public class DriverGrpcService extends DriverServiceGrpc.DriverServiceImplBase {
    @Override
    public void reserveDriver(ReserveDriverRequest request, StreamObserver<ReserveDriverResponse> responseObserver) {
        // ...
    }
}

// gRPC Client (WebClient for REST, ManagedChannel for gRPC)
@Bean
public ManagedChannel driverServiceChannel() {
    return ManagedChannelBuilder.forAddress("driver-service", 9092)
        .usePlaintext()
        .build();
}
```

### Go
```go
// Server
grpcServer := grpc.NewServer()
driverpb.RegisterDriverServiceServer(grpcServer, &DriverServer{})

// Client
conn, _ := grpc.DialContext(ctx, "driver-service:9092", grpc.WithTransportCredentials(insecure.NewCredentials()))
client := driverpb.NewDriverServiceClient(conn)
resp, _ := client.ReserveDriver(ctx, &driverpb.ReserveDriverRequest{...})
```

## Observability
- **REST**: OpenTelemetry HTTP instrumentation, standard metrics
- **gRPC**: OpenTelemetry gRPC interceptor, `grpc.server.duration`, `grpc.client.duration`
- **Correlation**: `traceparent` header propagated in both

## Security
- **External**: JWT in Authorization header, validated at Gateway
- **Internal**: mTLS (production), service-to-service JWT (dev), header propagation

## Related ADRs
- ADR-002: Polyglot (Go for gRPC services)
- ADR-003: Kafka (async alternative for non-blocking)
- ADR-007: Keycloak (JWT validation at Gateway + services)