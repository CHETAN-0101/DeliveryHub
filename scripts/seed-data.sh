#!/bin/bash
# Seed Development Data for DeliveryHub
# Populates databases with test data

set -e

COMPOSE_FILE="infra/docker-compose/docker-compose.yml"
PROJECT_NAME="deliveryhub-seed"

log_info() { echo -e "\033[0;32m[INFO]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

wait_for_db() {
    local service=$1
    local max=30
    local attempt=1
    log_info "Waiting for $service database..."
    while [ $attempt -le $max ]; do
        if docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T $service pg_isready -U postgres > /dev/null 2>&1; then
            log_info "$service database is ready"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    log_error "$service database not ready"
    return 1
}

# Start only databases and keycloak
log_info "Starting databases and Keycloak..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d postgres-order postgres-driver postgres-notification keycloak redis kafka

wait_for_db postgres-order
wait_for_db postgres-driver
wait_for_db postgres-notification

log_info "Seeding Order Service database..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T postgres-order psql -U order_user -d order_db << 'EOF'
-- Additional test deliveries
INSERT INTO deliveries (id, customer_id, pickup_address, pickup_latitude, pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, package_type, package_weight, status, version)
VALUES 
    (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '100 Wall St, New York, NY', 40.7071, -74.0113, '200 Park Ave, New York, NY', 40.7527, -73.9772, 'ELECTRONICS', 2.5, 'CREATED', 0),
    (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '500 5th Ave, New York, NY', 40.7484, -73.9857, '300 Madison Ave, New York, NY', 40.7514, -73.9821, 'CLOTHING', 1.2, 'CREATED', 0),
    (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '123 42nd St, New York, NY', 40.7549, -73.9840, '400 Lexington Ave, New York, NY', 40.7518, -73.9755, 'FOOD', 0.8, 'ASSIGNED', 0),
    (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '789 Broadway, New York, NY', 40.7282, -73.9942, '321 34th St, New York, NY', 40.7484, -73.9857, 'BOOKS', 3.0, 'IN_TRANSIT', 0),
    (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '222 14th St, New York, NY', 40.7358, -73.9911, '555 57th St, New York, NY', 40.7645, -73.9792, 'MEDICAL', 1.5, 'DELIVERED', 0)
ON CONFLICT DO NOTHING;
EOF

log_info "Seeding Driver Service database..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T postgres-driver psql -U driver_user -d driver_db << 'EOF'
-- Additional test drivers
INSERT INTO drivers (id, name, phone, email, vehicle_type, license_plate, status, current_latitude, current_longitude, last_location_update, rating, total_deliveries)
VALUES 
    (gen_random_uuid(), 'Mike Johnson', '+15551112222', 'mike@driver.com', 'CAR', 'CAR-001', 'AVAILABLE', 40.7484, -73.9857, NOW(), 4.9, 250),
    (gen_random_uuid(), 'Sarah Williams', '+15553334444', 'sarah@driver.com', 'BICYCLE', 'BIKE-002', 'AVAILABLE', 40.7589, -73.9851, NOW(), 4.8, 180),
    (gen_random_uuid(), 'David Brown', '+15555556666', 'david@driver.com', 'MOTORCYCLE', 'MOTO-003', 'OFFLINE', 40.7128, -74.0060, NOW() - INTERVAL '2 hours', 4.7, 95),
    (gen_random_uuid(), 'Lisa Davis', '+15557778888', 'lisa@driver.com', 'VAN', 'VAN-004', 'BUSY', 40.7589, -73.9851, NOW(), 4.6, 150),
    (gen_random_uuid(), 'James Wilson', '+15559990000', 'james@driver.com', 'TRUCK', 'TRUCK-005', 'AVAILABLE', 40.7282, -73.9942, NOW(), 4.5, 80)
ON CONFLICT (phone) DO NOTHING;
EOF

log_info "Seeding Notification Service database..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T postgres-notification psql -U notification_user -d notification_db << 'EOF'
-- Additional notification templates
INSERT INTO notification_templates (id, name, channel, subject_template, body_template, variables)
VALUES 
    (gen_random_uuid(), 'delivery_delayed_customer', 'EMAIL', 'Delivery Delayed - #{deliveryId}', 'Hi {customerName},\n\nYour delivery #{deliveryId} is delayed.\nNew estimated delivery: {newEta}\nReason: {delayReason}\n\nSorry for the inconvenience.\nDeliveryHub Team', '{"customerName": "string", "deliveryId": "string", "newEta": "string", "delayReason": "string"}'),
    
    (gen_random_uuid(), 'driver_new_assignment', 'PUSH', 'New Assignment', 'You have a new delivery: #{deliveryId}. Pickup: {pickupAddress}', '{"deliveryId": "string", "pickupAddress": "string"}'),
    
    (gen_random_uuid(), 'delivery_delayed_customer', 'SMS', NULL, 'DeliveryHub: Your delivery #{deliveryId} delayed. New ETA: {newEta}. Reason: {delayReason}', '{"deliveryId": "string", "newEta": "string", "delayReason": "string"}')
ON CONFLICT (name) DO NOTHING;
EOF

log_info "Seeding Redis with driver locations..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T redis redis-cli << 'EOF'
# Add driver geo locations
GEOADD drivers:geo -74.0060 40.7128 "driver-seed-1"
GEOADD drivers:geo -73.9857 40.7484 "driver-seed-2"
GEOADD drivers:geo -73.9851 40.7589 "driver-seed-3"
GEOADD drivers:geo -73.9942 40.7282 "driver-seed-4"
GEOADD drivers:geo -73.9792 40.7645 "driver-seed-5"

# Set statuses
SET driver:status:driver-seed-1 AVAILABLE EX 86400
SET driver:status:driver-seed-2 AVAILABLE EX 86400
SET driver:status:driver-seed-3 OFFLINE EX 86400
SET driver:status:driver-seed-4 BUSY EX 86400
SET driver:status:driver-seed-5 AVAILABLE EX 86400

# Set location caches
MSET driver:location:driver-seed-1:lat "40.7128" driver:location:driver-seed-1:lon "-74.0060" driver:location:driver-seed-1:updated "$(date +%s)" \
     driver:location:driver-seed-2:lat "40.7484" driver:location:driver-seed-2:lon "-73.9857" driver:location:driver-seed-2:updated "$(date +%s)" \
     driver:location:driver-seed-3:lat "40.7589" driver:location:driver-seed-3:lon "-73.9851" driver:location:driver-seed-3:updated "$(date -d '2 hours ago' +%s)" \
     driver:location:driver-seed-4:lat "40.7282" driver:location:driver-seed-4:lon "-73.9942" driver:location:driver-seed-4:updated "$(date +%s)" \
     driver:location:driver-seed-5:lat "40.7645" driver:location:driver-seed-5:lon "-73.9792" driver:location:driver-seed-5:updated "$(date +%s)"
EXPIRE driver:location:driver-seed-1:lat 86400
EXPIRE driver:location:driver-seed-1:lon 86400
EXPIRE driver:location:driver-seed-1:updated 86400
EXPIRE driver:location:driver-seed-2:lat 86400
EXPIRE driver:location:driver-seed-2:lon 86400
EXPIRE driver:location:driver-seed-2:updated 86400
EXPIRE driver:location:driver-seed-3:lat 86400
EXPIRE driver:location:driver-seed-3:lon 86400
EXPIRE driver:location:driver-seed-3:updated 86400
EXPIRE driver:location:driver-seed-4:lat 86400
EXPIRE driver:location:driver-seed-4:lon 86400
EXPIRE driver:location:driver-seed-4:updated 86400
EXPIRE driver:location:driver-seed-5:lat 86400
EXPIRE driver:location:driver-seed-5:lon 86400
EXPIRE driver:location:driver-seed-5:updated 86400
EOF

log_info "Seeding Kafka topics (create if not exist)..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.created --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.driver.assigned --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.picked_up --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.started --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.completed --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic delivery.cancelled --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T kafka kafka-topics.sh --create --if-not-exists --topic driver.location.updated --partitions 6 --replication-factor 1 --bootstrap-server localhost:9092

log_info "✅ All seed data loaded successfully!"
log_info "You can now start the full stack with: docker compose -f $COMPOSE_FILE up -d"