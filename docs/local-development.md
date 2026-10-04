# Local Development Guide

## Prerequisites

### Required Software
- **Docker Desktop** (4.0+) with Docker Compose v2
- **Java 21+** (for local Java development)
- **Go 1.22+** (for local Go development)
- **kubectl** (for Kubernetes deployment)
- **git** (for version control)

### Recommended Tools
- **IntelliJ IDEA** / **VS Code** with extensions
- **Postman** / **curl** for API testing
- **TablePlus** / **DBeaver** for database access
- **kafkacat** / **kcat** for Kafka debugging
- **redis-cli** for Redis debugging

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/yourorg/deliveryhub.git
cd deliveryhub
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work for local development)
```

### 3. Start All Services
```bash
docker compose -f infra/docker-compose/docker-compose.yml up --build -d
```

### 4. Verify Services
```bash
# Check service health
docker compose -f infra/docker-compose/docker-compose.yml ps

# Expected: All services show "healthy" or "running"
```

### 5. Access Points
| Service | URL | Credentials |
|---------|-----|-------------|
| API Gateway | http://localhost:8080 | - |
| Order Service API | http://localhost:8081 | - |
| Driver Service API | http://localhost:8082 | - |
| Dispatch Service | http://localhost:8083 | - |
| Notification Service | http://localhost:8084 | - |
| AI Service | http://localhost:8085 | - |
| Keycloak Admin | http://localhost:8090/admin | admin / admin |
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Jaeger | http://localhost:16686 | - |

## Development Workflow

### Running Individual Services Locally

#### Order Service (Java)
```bash
cd services/order-service
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
# Or with custom config:
./mvnw spring-boot:run -Dspring-boot.run.profiles=local \
  -Dspring.datasource.url=jdbc:postgresql://localhost:5432/order_db \
  -Dspring.kafka.bootstrap-servers=localhost:9092
```

#### Driver Service (Go)
```bash
cd services/driver-service
go run ./cmd/driver \
  -db-host=localhost \
  -redis-host=localhost \
  -kafka-brokers=localhost:9092
```

#### API Gateway (Go)
```bash
cd services/api-gateway
go run ./cmd/gateway \
  -order-service-url=http://localhost:8081 \
  -driver-service-url=http://localhost:8082
```

### Database Access

#### Order Database
```bash
# Via Docker
docker exec -it deliveryhub-postgres-order psql -U order_user -d order_db

# Direct connection
psql -h localhost -p 5432 -U order_user -d order_db
# Password: order_password
```

#### Driver Database
```bash
psql -h localhost -p 5433 -U driver_user -d driver_db
# Password: driver_password
```

#### Notification Database
```bash
psql -h localhost -p 5434 -U notification_user -d notification_db
# Password: notification_password
```

### Redis Access
```bash
# CLI
redis-cli -h localhost -p 6379

# Monitor commands
redis-cli MONITOR

# Check geo data
GEOPOS drivers:geo "driver-uuid"
GEORADIUS drivers:geo -74.0060 40.7128 5 km WITHDIST
```

### Kafka Access
```bash
# List topics
docker exec deliveryhub-kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Consume events
docker exec deliveryhub-kafka kafka-console-consumer.sh \
  --topic delivery.created \
  --from-beginning \
  --bootstrap-server localhost:9092

# Produce test event
echo '{"eventId":"test","eventType":"DeliveryCreated",...}' | \
docker exec -i deliveryhub-kafka kafka-console-producer.sh \
  --topic delivery.created \
  --bootstrap-server localhost:9092
```

## API Testing

### Authentication

#### Get Access Token
```bash
TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=customer1&password=password" \
  | jq -r .access_token)
```

#### Test API Call
```bash
curl -X GET http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN"
```

### Create Delivery (Full Flow)
```bash
# 1. Create driver
DRIVER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/drivers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Driver", "phone": "+15551234567", "vehicleType": "MOTORCYCLE"}')

DRIVER_ID=$(echo $DRIVER_RESPONSE | jq -r .id)

# 2. Set driver available
curl -X PATCH http://localhost:8080/api/v1/drivers/$DRIVER_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "AVAILABLE"}'

# 3. Set driver location
curl -X POST http://localhost:8080/api/v1/drivers/$DRIVER_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}'

# 4. Create delivery (with idempotency key)
curl -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-delivery-001" \
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
```

### Test Idempotency
```bash
# Repeat with same key - should return same delivery
curl -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-delivery-001" \
  -d '{...same payload...}'
```

### Test AI Endpoints
```bash
DELIVERY_ID="<delivery-id-from-above>"

# ETA Prediction
curl -X POST http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/eta \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "distance": 5.2,
    "driverDistance": 1.5,
    "averageSpeed": 25.0,
    "trafficLevel": "MEDIUM",
    "packageWeight": 0.5
  }'

# Risk Analysis
curl -X POST http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/risk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "driverDistance": 1.5,
    "trafficLevel": "MEDIUM",
    "packageWeight": 0.5,
    "weatherCondition": "CLEAR"
  }'
```

## Testing

### Run Unit Tests

#### Java Services
```bash
cd services/order-service
./mvnw test

cd services/notification-service
./mvnw test
```

#### Go Services
```bash
cd services/driver-service
go test ./...

cd services/api-gateway
go test ./...

cd services/dispatch-service
go test ./...

cd services/ai-service
go test ./...
```

### Run Integration Tests
```bash
# Requires Docker Compose running
cd services/order-service
./mvnw verify -Pintegration

cd services/notification-service
./mvnw verify -Pintegration

# Go integration tests
cd services/driver-service
go test -tags=integration ./...
```

### Run End-to-End Tests
```bash
# Full stack must be running
./scripts/run-e2e-tests.sh
```

## Debugging

### View Logs
```bash
# All services
docker compose -f infra/docker-compose/docker-compose.yml logs -f

# Specific service
docker compose -f infra/docker-compose/docker-compose.yml logs -f order-service

# Last 100 lines
docker compose -f infra/docker-compose/docker-compose.yml logs --tail=100 order-service
```

### Java Debugging
```bash
# Enable remote debugging
./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"

# Attach IDE debugger to localhost:5005
```

### Go Debugging
```bash
# Use delve
dlv debug ./cmd/driver

# Or with VS Code launch.json
{
  "type": "go",
  "request": "launch",
  "name": "Debug Driver Service",
  "program": "${workspaceFolder}/services/driver-service/cmd/driver",
  "args": ["-db-host=localhost", ...]
}
```

### Database Debugging
```sql
-- Check deliveries
SELECT * FROM deliveries ORDER BY created_at DESC LIMIT 10;

-- Check outbox
SELECT * FROM outbox_events WHERE published_at IS NULL;

-- Check idempotency
SELECT * FROM idempotency_records ORDER BY created_at DESC LIMIT 10;

-- Check delivery events
SELECT * FROM delivery_events WHERE delivery_id = 'uuid-here' ORDER BY created_at;
```

### Redis Debugging
```bash
# Check driver locations
redis-cli ZRANGE drivers:geo 0 -1 WITHCOORD

# Check driver statuses
redis-cli KEYS "driver:status:*"

# Check reservations
redis-cli KEYS "driver:reservation:*"
```

### Kafka Debugging
```bash
# Check consumer groups
docker exec deliveryhub-kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list

# Describe group
docker exec deliveryhub-kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group dispatch-service-group \
  --describe
```

## Common Issues

### Services Won't Start
```bash
# Check logs
docker compose logs service-name

# Common: Port conflicts
# Solution: Stop conflicting services or change ports in docker-compose.yml

# Common: Database not ready
# Solution: Wait for healthcheck, increase start_period
```

### Database Connection Failed
```bash
# Verify PostgreSQL is healthy
docker exec deliveryhub-postgres-order pg_isready -U order_user

# Check credentials match .env and docker-compose
```

### Kafka Connection Issues
```bash
# Verify Kafka is ready
docker exec deliveryhub-kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Check topics exist
docker exec deliveryhub-kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

### Keycloak Issues
```bash
# Wait for Keycloak to fully start (can take 60s+)
# Check logs for "Keycloak started" message

# Verify realm imported
curl http://localhost:8090/realms/deliveryhub
```

### Rate Limiting
```bash
# If getting 429, check Redis rate limit keys
redis-cli KEYS "ratelimit:*"

# Adjust in .env
GATEWAY_RATE_LIMIT_RPS=1000
GATEWAY_RATE_LIMIT_BURST=2000
```

## Useful Commands

### Reset Everything
```bash
docker compose -f infra/docker-compose/docker-compose.yml down -v
docker compose -f infra/docker-compose/docker-compose.yml up --build -d
```

### Rebuild Single Service
```bash
docker compose -f infra/docker-compose/docker-compose.yml build order-service
docker compose -f infra/docker-compose/docker-compose.yml up -d order-service
```

### Scale Service
```bash
docker compose -f infra/docker-compose/docker-compose.yml up -d --scale order-service=3
```

### Access Service Shell
```bash
docker exec -it deliveryhub-order-service sh
docker exec -it deliveryhub-driver-service sh
```

## IDE Configuration

### IntelliJ IDEA
1. Import as Maven project (order-service, notification-service)
2. Import as Go module (driver-service, api-gateway, dispatch-service, ai-service)
3. Configure run configurations for each service
4. Add Docker Compose run configuration for full stack

### VS Code
```json
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Order Service",
      "type": "java",
      "request": "launch",
      "mainClass": "com.deliveryhub.order.OrderServiceApplication",
      "projectName": "order-service"
    },
    {
      "name": "Driver Service",
      "type": "go",
      "request": "launch",
      "program": "${workspaceFolder}/services/driver-service/cmd/driver",
      "args": ["-db-host=localhost", "-redis-host=localhost"]
    }
  ]
}
```

## Performance Tuning (Local)

### Reduce Resource Usage
```yaml
# In docker-compose.yml, adjust:
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

### Disable Unneeded Services
```bash
# Comment out in docker-compose.yml if not needed:
# - ai-service
# - notification-service
# - jaeger (if not tracing)
```

## Next Steps

1. **Add a new delivery type**: Modify Order Service entity and validation
2. **Implement new notification channel**: Add provider in Notification Service
3. **Improve AI model**: Replace MockAIProvider with real ML model
4. **Add metrics dashboard**: Create custom Grafana dashboard
5. **Load testing**: Use k6 or JMeter against local stack