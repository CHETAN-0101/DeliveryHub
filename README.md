# DeliveryHub - AI-Powered Delivery Management Platform

A production-style microservices reference application demonstrating distributed systems patterns, event-driven architecture, and cloud-native practices. Built for system design interviews and backend engineering showcases.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│ API Gateway  │────▶│  Services   │
└─────────────┘     │   (Go)       │     │             │
                    └──────┬───────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼──────┐     ┌──────▼──────┐
                    │   Kafka     │     │   Redis     │
                    │  (Events)   │     │ (Locations) │
                    └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌──────────┐ ┌────────────┐
         │ Order   │ │Dispatch  │ │ Notification│
         │ Service │ │ Service  │ │  Service   │
         │ (Java)  │ │  (Go)    │ │   (Java)   │
         └────┬────┘ └────┬─────┘ └─────┬──────┘
              │           │             │
              ▼           ▼             ▼
         ┌─────────┐ ┌──────────┐ ┌────────────┐
         │PostgreSQL│ │PostgreSQL│ │PostgreSQL  │
         │(order_db)│ │(driver_db)│ │(notif_db)  │
         └─────────┘ └──────────┘ └────────────┘
```

## Services

| Service | Language | Purpose |
|---------|----------|---------|
| **api-gateway** | Go | JWT validation, routing, rate limiting, observability |
| **order-service** | Java/Spring Boot | Delivery CRUD, state machine, outbox pattern |
| **driver-service** | Go | Driver management, Redis geo-location, gRPC |
| **dispatch-service** | Go | Driver assignment, saga orchestration |
| **notification-service** | Java/Spring Boot | Multi-channel notifications, retry logic |
| **ai-service** | Go | ETA prediction, risk analysis, AI assistant |

## Technology Stack

- **Languages**: Java 21, Go 1.22
- **Frameworks**: Spring Boot 3.2, Standard Library (Go)
- **Databases**: PostgreSQL 16 (per-service)
- **Messaging**: Apache Kafka 3.6 (KRaft mode)
- **Cache**: Redis 7 (Geo + Pub/Sub)
- **Auth**: Keycloak 24 (OIDC/JWT)
- **Observability**: OpenTelemetry, Prometheus, Grafana, Jaeger
- **Infrastructure**: Docker, Docker Compose, Kubernetes
- **CI/CD**: GitHub Actions

## Key Patterns Implemented

- **Event-Driven Architecture**: Kafka for async communication
- **Outbox Pattern**: Reliable event publishing with PostgreSQL
- **Saga Pattern**: Orchestrated delivery workflow
- **Idempotency**: Safe retries with `Idempotency-Key` header
- **Optimistic Locking**: Version column for concurrency control
- **Circuit Breaker**: Resilience4j (Java), custom (Go)
- **Distributed Tracing**: OpenTelemetry across all services
- **Database-per-Service**: Zero shared databases

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Java 21+ (for local development)
- Go 1.22+ (for local development)
- kubectl (for Kubernetes deployment)

### Local Development

```bash
# Clone and navigate
cd deliveryhub

# Copy environment template
cp .env.example .env

# Start all services
docker compose -f infra/docker-compose/docker-compose.yml up --build

# Wait for all services to become healthy (check with docker compose ps)
```

### Access Points

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:8080 |
| Order Service API | http://localhost:8081/api/v1/deliveries |
| Driver Service API | http://localhost:8082/api/v1/drivers |
| Dispatch Service | http://localhost:8083 |
| Notification Service | http://localhost:8084/api/v1/notifications |
| AI Service | http://localhost:8085/api/v1/ai |
| Keycloak Admin | http://localhost:8090/admin |
| Grafana | http://localhost:3000 (admin/admin) |
| Prometheus | http://localhost:9090 |
| Jaeger | http://localhost:16686 |

### API Documentation

OpenAPI/Swagger UI available at:
- Gateway: http://localhost:8080/api/docs
- Order Service: http://localhost:8081/api/docs
- Driver Service: http://localhost:8082/api/docs
- Notification Service: http://localhost:8084/api/docs
- AI Service: http://localhost:8085/api/docs

## Demo Workflow

```bash
# 1. Get token from Keycloak
TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=customer1&password=password" | jq -r .access_token)

# 2. Create a driver
curl -X POST http://localhost:8080/api/v1/drivers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Driver", "phone": "+1234567890", "vehicleType": "MOTORCYCLE"}'

# 3. Set driver available and location
curl -X PATCH http://localhost:8080/api/v1/drivers/{driverId}/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "AVAILABLE"}'

curl -X POST http://localhost:8080/api/v1/drivers/{driverId}/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}'

# 4. Create a delivery
curl -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-delivery-001" \
  -d '{
    "pickupAddress": "123 Main St, New York, NY",
    "pickupLatitude": 40.7128,
    "pickupLongitude": -74.0060,
    "dropoffAddress": "456 Broadway, New York, NY",
    "dropoffLatitude": 40.7589,
    "dropoffLongitude": -73.9851,
    "packageType": "DOCUMENTS",
    "packageWeight": 0.5
  }'

# 5. Watch the event flow in Grafana/Jaeger
# 6. Check AI ETA prediction
curl -X GET http://localhost:8080/api/v1/ai/deliveries/{deliveryId}/eta \
  -H "Authorization: Bearer $TOKEN"
```

## Testing

```bash
# Run all tests
make test

# Run integration tests (requires Docker)
make test-integration

# Run end-to-end test
make test-e2e
```

## Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f infra/kubernetes/

# Check status
kubectl get pods -n deliveryhub
```

## Documentation

- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [Event Catalog](docs/event-catalog.md)
- [Security Model](docs/security.md)
- [Local Development](docs/local-development.md)
- [Interview Guide](docs/interview-guide.md)
- [ADRs](docs/decisions/)

## Project Structure

```
deliveryhub/
├── services/
│   ├── api-gateway/          # Go - Gateway, auth, rate limiting
│   ├── order-service/        # Java - Delivery management, outbox
│   ├── driver-service/       # Go - Drivers, Redis geo, gRPC
│   ├── dispatch-service/     # Go - Assignment, saga orchestration
│   ├── notification-service/ # Java - Multi-channel notifications
│   └── ai-service/           # Go - ETA, risk, AI assistant
├── contracts/
│   ├── openapi/              # OpenAPI specs
│   ├── proto/                # gRPC definitions
│   └── events/               # Kafka event schemas
├── infra/
│   ├── docker-compose/       # Local development stack
│   ├── kubernetes/           # K8s manifests
│   ├── prometheus/           # Prometheus config
│   ├── grafana/              # Dashboards
│   ├── otel/                 # OpenTelemetry collector
│   └── keycloak/             # Realm configuration
├── scripts/                  # Utility scripts
├── docs/                     # Documentation
├── .github/workflows/        # CI/CD pipelines
├── Makefile                  # Build automation
├── .env.example              # Environment template
└── README.md                 # This file
```

## License

MIT License - See LICENSE file for details.