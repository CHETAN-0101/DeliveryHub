# DeliveryHub Event Catalog

## Overview

All events follow a common envelope structure with versioned payloads. Events are published to Kafka topics with the aggregate ID as the key for ordering guarantees.

## Common Event Envelope

```json
{
  "eventId": "uuid",
  "eventType": "DeliveryCreated",
  "version": 1,
  "occurredAt": "2024-01-15T10:30:00Z",
  "aggregateId": "uuid",
  "payload": {}
}
```

## Event Definitions

### DeliveryCreated
**Topic**: `delivery.created`  
**Published by**: Order Service  
**Consumed by**: Dispatch Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "DeliveryCreated",
  "version": 1,
  "occurredAt": "2024-01-15T10:30:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "customerId": "770e8400-e29b-41d4-a716-446655440002",
    "pickupAddress": "123 Main St, New York, NY",
    "pickupLatitude": 40.7128,
    "pickupLongitude": -74.0060,
    "dropoffAddress": "456 Broadway, New York, NY",
    "dropoffLatitude": 40.7589,
    "dropoffLongitude": -73.9851,
    "packageType": "DOCUMENTS",
    "packageWeight": 0.5,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### DriverAssigned
**Topic**: `delivery.driver.assigned`  
**Published by**: Dispatch Service  
**Consumed by**: Notification Service, Order Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440003",
  "eventType": "DriverAssigned",
  "version": 1,
  "occurredAt": "2024-01-15T10:31:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "driverId": "880e8400-e29b-41d4-a716-446655440004",
    "driverName": "John Driver",
    "driverPhone": "+1234567890",
    "vehicleType": "MOTORCYCLE",
    "licensePlate": "ABC-1234",
    "assignedAt": "2024-01-15T10:31:00Z"
  }
}
```

### DeliveryPickedUp
**Topic**: `delivery.picked_up`  
**Published by**: Order Service (via driver action)  
**Consumed by**: Notification Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440005",
  "eventType": "DeliveryPickedUp",
  "version": 1,
  "occurredAt": "2024-01-15T10:45:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "oldStatus": "ASSIGNED",
    "newStatus": "PICKED_UP",
    "driverId": "880e8400-e29b-41d4-a716-446655440004",
    "changedAt": "2024-01-15T10:45:00Z"
  }
}
```

### DeliveryStarted
**Topic**: `delivery.started`  
**Published by**: Order Service  
**Consumed by**: Notification Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440006",
  "eventType": "DeliveryStarted",
  "version": 1,
  "occurredAt": "2024-01-15T10:46:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "oldStatus": "PICKED_UP",
    "newStatus": "IN_TRANSIT",
    "driverId": "880e8400-e29b-41d4-a716-446655440004",
    "changedAt": "2024-01-15T10:46:00Z"
  }
}
```

### DeliveryCompleted
**Topic**: `delivery.completed`  
**Published by**: Order Service  
**Consumed by**: Notification Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440007",
  "eventType": "DeliveryCompleted",
  "version": 1,
  "occurredAt": "2024-01-15T11:15:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "oldStatus": "IN_TRANSIT",
    "newStatus": "DELIVERED",
    "driverId": "880e8400-e29b-41d4-a716-446655440004",
    "changedAt": "2024-01-15T11:15:00Z"
  }
}
```

### DeliveryCancelled
**Topic**: `delivery.cancelled`  
**Published by**: Order Service  
**Consumed by**: Notification Service, Dispatch Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440008",
  "eventType": "DeliveryCancelled",
  "version": 1,
  "occurredAt": "2024-01-15T10:35:00Z",
  "aggregateId": "660e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "deliveryId": "660e8400-e29b-41d4-a716-446655440001",
    "customerId": "770e8400-e29b-41d4-a716-446655440002",
    "reason": "Customer requested cancellation",
    "cancelledAt": "2024-01-15T10:35:00Z"
  }
}
```

### DriverLocationUpdated
**Topic**: `driver.location.updated`  
**Published by**: Driver Service  
**Consumed by**: Dispatch Service (for real-time tracking), AI Service

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440009",
  "eventType": "DriverLocationUpdated",
  "version": 1,
  "occurredAt": "2024-01-15T10:40:00Z",
  "aggregateId": "880e8400-e29b-41d4-a716-446655440004",
  "payload": {
    "driverId": "880e8400-e29b-41d4-a716-446655440004",
    "latitude": 40.7130,
    "longitude": -74.0055,
    "updatedAt": "2024-01-15T10:40:00Z"
  }
}
```

## Topic Configuration

| Topic | Partitions | Replication | Retention | Cleanup Policy |
|-------|------------|-------------|-----------|----------------|
| delivery.created | 3 | 1 | 7 days | compact |
| delivery.driver.assigned | 3 | 1 | 7 days | compact |
| delivery.picked_up | 3 | 1 | 7 days | compact |
| delivery.started | 3 | 1 | 7 days | compact |
| delivery.completed | 3 | 1 | 7 days | compact |
| delivery.cancelled | 3 | 1 | 7 days | compact |
| driver.location.updated | 6 | 1 | 24 hours | delete |
| delivery.dlq | 1 | 1 | 30 days | compact |
| notification.dlq | 1 | 1 | 30 days | compact |

## Consumer Groups

| Service | Consumer Group | Topics |
|---------|---------------|--------|
| Dispatch Service | dispatch-service-group | delivery.created, delivery.cancelled |
| Notification Service | notification-service-group | delivery.driver.assigned, delivery.picked_up, delivery.started, delivery.completed, delivery.cancelled |
| Driver Service | driver-service-group | driver.location.updated (optional) |
| AI Service | ai-service-group | delivery.created, driver.location.updated |

## Idempotency

All consumers must handle duplicate events. Strategies:

1. **Event ID tracking**: Store processed `eventId` in Redis with TTL
2. **Natural idempotency**: State transitions are naturally idempotent (e.g., setting status to ASSIGNED twice)
3. **Upsert patterns**: Use `ON CONFLICT` for database writes

## Schema Evolution

- **Backward compatible**: Add optional fields only
- **Version field**: Increment `version` for breaking changes
- **Migration**: Run dual-write during transition period
- **Validation**: Consumers validate required fields, ignore unknown fields

## Dead Letter Queue

Events that fail processing after max retries go to DLQ topics:
- `delivery.dlq` - for delivery events
- `notification.dlq` - for notification events

DLQ messages include:
- Original event
- Error message
- Retry count
- Timestamp of failure
- Consumer service name

## Monitoring

Key metrics per topic:
- `kafka_consumer_lag` - consumer lag per partition
- `kafka_messages_consumed_total` - throughput
- `kafka_consumer_errors_total` - error rate
- `event_processing_duration_seconds` - latency