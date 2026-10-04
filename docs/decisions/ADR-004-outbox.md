# ADR-004: Outbox Pattern for Reliable Event Publishing

## Status
Accepted

## Context
When an order service creates/updates a delivery, it must both persist the change to PostgreSQL AND publish an event to Kafka. Doing these as separate operations risks dual-write failures:
1. DB commit succeeds, Kafka publish fails → event lost
2. Kafka publish succeeds, DB rollback → phantom event

## Decision
Use the **Transactional Outbox Pattern**: write events to an `outbox_events` table in the same database transaction as the business data. A separate publisher process polls the outbox and publishes to Kafka.

## Implementation

### Database Schema
```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,  -- 'Delivery'
    event_type VARCHAR(100) NOT NULL,     -- 'DeliveryCreated'
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON outbox_events(published_at) WHERE published_at IS NULL;
```

### Write Path (Same Transaction)
```java
@Transactional
public Delivery createDelivery(...) {
    Delivery delivery = new Delivery(...);
    deliveryRepository.save(delivery);
    
    // Same transaction - atomic
    outboxPublisher.saveOutboxEvent(
        delivery.getId(), 
        "Delivery", 
        "DeliveryCreated", 
        deliveryCreatedPayload
    );
    
    return delivery;
}
```

### Publisher (Separate Thread/Process)
```java
@Scheduled(fixedDelay = 5000)
@Transactional
public void publishPendingEvents() {
    List<OutboxEvent> events = outboxRepository.findUnpublishedEvents(batchSize);
    
    for (OutboxEvent event : events) {
        try {
            kafkaTemplate.send(topic, event.getAggregateId().toString(), event.getPayload()).get();
            event.markPublished();
            outboxRepository.save(event);
        } catch (Exception e) {
            log.error("Failed to publish", e);
            // Will retry on next poll
        }
    }
}
```

## Alternatives Considered

### Direct Kafka Produce in Transaction
```java
@Transactional
public void createDelivery() {
    deliveryRepository.save(delivery);
    kafkaTemplate.send("delivery.created", ...); // NOT transactional!
}
```
**Problem**: Kafka send is not part of DB transaction. If Kafka fails after DB commit, event is lost. If DB rolls back after Kafka send, phantom event exists.

### Change Data Capture (Debezium)
**Pros**: No code changes, captures all changes, exactly-once
**Cons**: 
- Additional infrastructure (Debezium connector, Kafka Connect)
- Schema coupling (DB schema = event schema)
- Latency (connector poll interval)
- Operational complexity

### Saga with Compensating Transactions
**Pros**: Explicit failure handling
**Cons**: 
- Overkill for simple event publishing
- Requires designing compensating actions for every operation
- More complex code

### Dual Write with Retry Queue
**Pros**: Simple concept
**Cons**: 
- Still race condition between write and queue
- Need persistent retry queue (another system)
- No atomicity guarantee

## Consequences

### Positive
- **Atomicity**: DB change + event = single transaction
- **No Data Loss**: Events persisted in PostgreSQL (ACID)
- **Simplicity**: No external dependencies for write path
- **Ordering**: Events published in same order as transactions
- **Replayability**: Can re-publish by resetting `published_at`

### Negative
- **Polling Latency**: 5s default delay before event reaches Kafka
- **Publisher Failure**: If publisher crashes, events queue up (monitor `published_at IS NULL`)
- **Duplicate Events**: Publisher may re-publish on crash (consumers must be idempotent)
- **Additional Table**: Storage overhead, index maintenance

## Optimizations

### Batch Publishing
```java
// Publish up to 100 events per poll
List<OutboxEvent> events = outboxRepository.findUnpublishedEvents(100);
for (event : events) { ... }
```

### Idempotent Consumers
Since publisher may re-send on crash, consumers MUST handle duplicates:
```go
// Redis deduplication
processed, _ := redis.SetNX(ctx, "processed:"+eventId, "1", 24*time.Hour).Result()
if !processed {
    return // Already handled
}
```

### Monitoring
```sql
-- Alert if unpublished events > threshold
SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL;
```

### Failure Handling
- **Kafka Unavailable**: Publisher retries with exponential backoff
- **Publisher Crash**: Events remain unpublished, picked up on restart
- **Partial Batch Failure**: Successful events marked published, failed ones retried next poll

## Guarantees
- **At-Least-Once Delivery**: Publisher retries until acknowledged
- **Ordering**: Per-aggregate ordering (same aggregateId → same partition)
- **No Loss**: Events in PostgreSQL survive any publisher/Kafka outage

## Related ADRs
- ADR-003: Kafka for Async Events (transport)
- ADR-010: Idempotency Strategy (consumer side)
- ADR-009: Database-per-Service (outbox per service DB)