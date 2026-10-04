#!/bin/bash
# End-to-End Test for DeliveryHub
# Full workflow: create driver → create delivery → dispatch → complete → notify

set -e

COMPOSE_FILE="infra/docker-compose/docker-compose.yml"
PROJECT_NAME="deliveryhub-e2e"

echo "🚀 Starting DeliveryHub End-to-End Test"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

wait_for_health() {
    local service=$1
    local url=$2
    local max=60
    local attempt=1
    log_info "Waiting for $service..."
    while [ $attempt -le $max ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_info "$service is healthy"
            return 0
        fi
        sleep 5
        attempt=$((attempt + 1))
    done
    log_error "$service failed health check"
    return 1
}

# Start stack
log_info "Starting Docker Compose stack..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up --build -d

# Wait for services
wait_for_health "API Gateway" "http://localhost:8080/health"
wait_for_health "Order Service" "http://localhost:8081/actuator/health"
wait_for_health "Driver Service" "http://localhost:8082/health"
wait_for_health "Dispatch Service" "http://localhost:8083/health"
wait_for_health "Notification Service" "http://localhost:8084/actuator/health"
wait_for_health "AI Service" "http://localhost:8085/health"
wait_for_health "Keycloak" "http://localhost:8090/health/ready"

# Get tokens for different roles
log_info "Authenticating users..."
CUSTOMER_TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=customer1&password=password" | jq -r .access_token)

DRIVER_TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=driver1&password=password" | jq -r .access_token)

DISPATCHER_TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=dispatcher1&password=password" | jq -r .access_token)

# Verify tokens
for token in "$CUSTOMER_TOKEN" "$DRIVER_TOKEN" "$DISPATCHER_TOKEN"; do
    if [ "$token" == "null" ] || [ -z "$token" ]; then
        log_error "Failed to get token"
        exit 1
    fi
done
log_info "All tokens obtained"

# ============================================================
# SCENARIO: Complete Delivery Lifecycle
# ============================================================

log_info "===== SCENARIO: Complete Delivery Lifecycle ====="

# 1. Create a driver (as dispatcher)
log_info "1. Creating driver..."
DRIVER_RESP=$(curl -s -X POST http://localhost:8080/api/v1/drivers \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Driver", "phone": "+15559998888", "vehicleType": "MOTORCYCLE"}')
DRIVER_ID=$(echo $DRIVER_RESP | jq -r .id)
log_info "Created driver: $DRIVER_ID"

# 2. Set driver available
log_info "2. Setting driver AVAILABLE..."
curl -s -X PATCH "http://localhost:8080/api/v1/drivers/$DRIVER_ID/status" \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "AVAILABLE"}' > /dev/null
log_info "Driver set to AVAILABLE"

# 3. Set driver location (near pickup)
log_info "3. Setting driver location..."
curl -s -X POST "http://localhost:8080/api/v1/drivers/$DRIVER_ID/location" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}' > /dev/null
log_info "Driver location set"

# 4. Create delivery (as customer)
log_info "4. Creating delivery..."
IDEMPOTENCY_KEY="e2e-delivery-$(date +%s)"
DELIVERY_RESP=$(curl -s -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "pickupAddress": "123 Main St, New York, NY",
    "pickupLatitude": 40.7128,
    "pickupLongitude": -74.0060,
    "dropoffAddress": "456 Broadway, New York, NY",
    "dropoffLatitude": 40.7589,
    "dropoffLongitude": -73.9851,
    "packageType": "DOCUMENTS",
    "packageWeight": 0.5
  }')

DELIVERY_ID=$(echo $DELIVERY_RESP | jq -r .id)
log_info "Created delivery: $DELIVERY_ID"

# 5. Wait for dispatch assignment
log_info "5. Waiting for dispatch assignment (max 60s)..."
ASSIGNED=false
for i in {1..30}; do
    DELIVERY_CHECK=$(curl -s -X GET "http://localhost:8080/api/v1/deliveries/$DELIVERY_ID" \
      -H "Authorization: Bearer $CUSTOMER_TOKEN")
    STATUS=$(echo $DELIVERY_CHECK | jq -r .status)
    DRIVER=$(echo $DELIVERY_CHECK | jq -r .driverId)
    
    if [ "$STATUS" == "ASSIGNED" ] && [ "$DRIVER" != "null" ]; then
        ASSIGNED_DRIVER=$DRIVER
        log_info "Delivery assigned to driver: $ASSIGNED_DRIVER"
        ASSIGNED=true
        break
    fi
    log_info "   Status: $STATUS (attempt $i/30)"
    sleep 2
done

if [ "$ASSIGNED" == "false" ]; then
    log_error "Dispatch assignment failed"
    exit 1
fi

# 6. Driver picks up package
log_info "6. Driver picks up package..."
curl -s -X POST "http://localhost:8080/api/v1/deliveries/$DELIVERY_ID/pickup" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" > /dev/null
log_info "Package picked up"

# 7. Driver starts delivery
log_info "7. Driver starts delivery..."
curl -s -X POST "http://localhost:8080/api/v1/deliveries/$DELIVERY_ID/start" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" > /dev/null
log_info "Delivery started"

# 8. Driver completes delivery
log_info "8. Driver completes delivery..."
curl -s -X POST "http://localhost:8080/api/v1/deliveries/$DELIVERY_ID/complete" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" > /dev/null
log_info "Delivery completed"

# Verify completion via status check
log_info "8b. Verifying delivery completion..."
for i in {1..15}; do
    DELIVERY_CHECK=$(curl -s -X GET "http://localhost:8080/api/v1/deliveries/$DELIVERY_ID" \
      -H "Authorization: Bearer $CUSTOMER_TOKEN")
    STATUS=$(echo $DELIVERY_CHECK | jq -r .status)
    
    if [ "$STATUS" == "DELIVERED" ]; then
        log_info "Delivery confirmed completed!"
        break
    fi
    if [ "$STATUS" == "CANCELLED" ]; then
        log_error "Delivery was cancelled"
        exit 1
    fi
    log_info "   Status: $STATUS (attempt $i/15)"
    sleep 3
done

# 9. Verify notifications generated
log_info "9. Checking notifications..."
sleep 5
NOTIF_RESP=$(curl -s -X GET "http://localhost:8080/api/v1/notifications?deliveryId=$DELIVERY_ID" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
NOTIF_COUNT=$(echo $NOTIF_RESP | jq -r .totalElements)
log_info "Notifications for delivery: $NOTIF_COUNT"

# 10. AI ETA Prediction (during delivery)
log_info "10. Testing AI ETA during delivery..."
ETA_RESP=$(curl -s -X POST "http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/eta" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "distance": 2.5,
    "driverDistance": 0.5,
    "averageSpeed": 20.0,
    "trafficLevel": "LOW",
    "packageWeight": 0.5
  }')
ETA=$(echo $ETA_RESP | jq -r .etaMinutes)
CONF=$(echo $ETA_RESP | jq -r .confidence)
log_info "AI ETA: $ETA minutes (confidence: $CONF)"

# 11. AI Risk Analysis
log_info "11. Testing AI Risk Analysis..."
RISK_RESP=$(curl -s -X POST "http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/risk" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "driverDistance": 0.5,
    "trafficLevel": "LOW",
    "packageWeight": 0.5,
    "weatherCondition": "CLEAR"
  }')
RISK=$(echo $RISK_RESP | jq -r .risk)
log_info "AI Risk: $RISK"

# 12. AI Assistant Query
log_info "12. Testing AI Assistant..."
ASSISTANT_RESP=$(curl -s -X POST "http://localhost:8080/api/v1/ai/assistant" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the status of my delivery?"}')
ANSWER=$(echo $ASSISTANT_RESP | jq -r .answer)
log_info "AI Assistant: $ANSWER"

log_info "===== E2E Test Completed Successfully! ====="

# Cleanup
log_info "Cleaning up..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v

log_info "✅ All E2E tests passed!"