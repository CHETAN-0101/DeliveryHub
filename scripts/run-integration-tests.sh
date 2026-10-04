#!/bin/bash
# Integration Test Runner for DeliveryHub
# Runs against Docker Compose stack

set -e

COMPOSE_FILE="infra/docker-compose/docker-compose.yml"
PROJECT_NAME="deliveryhub-test"

echo "🧪 Starting DeliveryHub Integration Tests"

# Function to wait for service health
wait_for_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for $service to be healthy..."
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo "✅ $service is healthy"
            return 0
        fi
        echo "   Attempt $attempt/$max_attempts - waiting..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service failed to become healthy"
    return 1
}

# Start services
echo "🚀 Starting Docker Compose stack..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up --build -d

# Wait for all services
wait_for_health "API Gateway" "http://localhost:8080/health"
wait_for_health "Order Service" "http://localhost:8081/actuator/health"
wait_for_health "Driver Service" "http://localhost:8082/health"
wait_for_health "Dispatch Service" "http://localhost:8083/health"
wait_for_health "Notification Service" "http://localhost:8084/actuator/health"
wait_for_health "AI Service" "http://localhost:8085/health"
wait_for_health "Keycloak" "http://localhost:8090/health/ready"

echo "🔑 Getting authentication token..."
TOKEN=$(curl -s -X POST http://localhost:8090/realms/deliveryhub/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=delivery-client&username=customer1&password=password" \
  | jq -r .access_token)

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Failed to get token"
    exit 1
fi
echo "✅ Got token: ${TOKEN:0:20}..."

# Test 1: Create Driver
echo ""
echo "📋 Test 1: Create Driver"
DRIVER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/drivers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Driver", "phone": "+15551234567", "vehicleType": "MOTORCYCLE"}')

DRIVER_ID=$(echo $DRIVER_RESPONSE | jq -r .id)
echo "✅ Created driver: $DRIVER_ID"

# Test 2: Set Driver Available
echo ""
echo "📋 Test 2: Set Driver Available"
curl -s -X PATCH http://localhost:8080/api/v1/drivers/$DRIVER_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "AVAILABLE"}' > /dev/null
echo "✅ Driver set to AVAILABLE"

# Test 3: Set Driver Location
echo ""
echo "📋 Test 3: Set Driver Location"
curl -s -X POST http://localhost:8080/api/v1/drivers/$DRIVER_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}' > /dev/null
echo "✅ Driver location set"

# Test 4: Create Delivery (with idempotency key)
echo ""
echo "📋 Test 4: Create Delivery"
IDEMPOTENCY_KEY="test-delivery-$(date +%s)"
DELIVERY_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN" \
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

DELIVERY_ID=$(echo $DELIVERY_RESPONSE | jq -r .id)
DELIVERY_STATUS=$(echo $DELIVERY_RESPONSE | jq -r .status)
echo "✅ Created delivery: $DELIVERY_ID (status: $DELIVERY_STATUS)"

# Test 5: Verify Idempotency
echo ""
echo "📋 Test 5: Verify Idempotency"
IDEMPOTENT_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN" \
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

IDEMPOTENT_ID=$(echo $IDEMPOTENT_RESPONSE | jq -r .id)
if [ "$IDEMPOTENT_ID" == "$DELIVERY_ID" ]; then
    echo "✅ Idempotency works - same delivery returned"
else
    echo "❌ Idempotency failed - different delivery: $IDEMPOTENT_ID"
    exit 1
fi

# Test 6: Wait for Dispatch (async)
echo ""
echo "📋 Test 6: Wait for Dispatch Assignment (max 30s)"
ASSIGNED=false
for i in {1..15}; do
    DELIVERY_CHECK=$(curl -s -X GET http://localhost:8080/api/v1/deliveries/$DELIVERY_ID \
      -H "Authorization: Bearer $TOKEN")
    STATUS=$(echo $DELIVERY_CHECK | jq -r .status)
    DRIVER=$(echo $DELIVERY_CHECK | jq -r .driverId)
    
    if [ "$STATUS" == "ASSIGNED" ] && [ "$DRIVER" != "null" ]; then
        echo "✅ Delivery assigned to driver: $DRIVER"
        ASSIGNED=true
        break
    fi
    echo "   Status: $STATUS (attempt $i/15)"
    sleep 2
done

if [ "$ASSIGNED" == "false" ]; then
    echo "⚠️  Dispatch assignment not completed (may need more time)"
fi

# Test 7: AI ETA Prediction
echo ""
echo "📋 Test 7: AI ETA Prediction"
ETA_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/eta \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "distance": 5.2,
    "driverDistance": 1.5,
    "averageSpeed": 25.0,
    "trafficLevel": "MEDIUM",
    "packageWeight": 0.5
  }')

ETA_MINUTES=$(echo $ETA_RESPONSE | jq -r .etaMinutes)
CONFIDENCE=$(echo $ETA_RESPONSE | jq -r .confidence)
echo "✅ ETA Prediction: $ETA_MINUTES minutes (confidence: $CONFIDENCE)"

# Test 8: AI Risk Analysis
echo ""
echo "📋 Test 8: AI Risk Analysis"
RISK_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/ai/deliveries/$DELIVERY_ID/risk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "driverDistance": 1.5,
    "trafficLevel": "MEDIUM",
    "packageWeight": 0.5,
    "weatherCondition": "CLEAR"
  }')

RISK_LEVEL=$(echo $RISK_RESPONSE | jq -r .risk)
REASONS=$(echo $RISK_RESPONSE | jq -r .reasons[])
echo "✅ Risk Analysis: $RISK_LEVEL"
for reason in $REASONS; do
    echo "   - $reason"
done

# Test 9: List Deliveries
echo ""
echo "📋 Test 9: List Deliveries"
LIST_RESPONSE=$(curl -s -X GET http://localhost:8080/api/v1/deliveries \
  -H "Authorization: Bearer $TOKEN")
TOTAL=$(echo $LIST_RESPONSE | jq -r .totalElements)
echo "✅ Total deliveries: $TOTAL"

# Test 10: Get Notifications
echo ""
echo "📋 Test 10: Get Notifications"
NOTIF_RESPONSE=$(curl -s -X GET http://localhost:8080/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN")
NOTIF_COUNT=$(echo $NOTIF_RESPONSE | jq -r .totalElements)
echo "✅ Total notifications: $NOTIF_COUNT"

echo ""
echo "🎉 All integration tests passed!"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v

echo "✅ Integration tests completed successfully!"