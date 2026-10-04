# ADR-003: Kafka for Asynchronous Events

## Status
Accepted

## Context
DeliveryHub services need to communicate asynchronously for loose coupling and fault tolerance. Events include delivery lifecycle changes, driver assignments, location updates, and notifications.

## Decision
Use Apache Kafka (3.6+ KRaft mode) as the event backbone for all inter-service asynchronous communication.

## Why Kafka?

### Durability & Reliability
- **Replicated Log**: Configurable replication factor (3 in prod), `acks=all` for producer
- **Persistence**: Events stored on disk, configurable retention (7 days default)
- **No Data Loss**: With proper configuration, at-least-once delivery guaranteed

### Ordering Guarantees
- **Per-Partition Ordering**: Events with same key (deliveryId/driverId) go to same partition
- **Total Order**: Within a partition, total order preserved
- **Consumer Control**: Consumers manage offsets, can replay from any point

### Throughput & Scalability
- **High Throughput**: Millions of messages/second on modest hardware
- **Horizontal Scaling**: Add partitions, add consumer instances
- **Consumer Groups**: Parallel processing with exactly-once semantics

### Ecosystem
- **Kafka Connect**: CDC, sinks to databases, S3, Elasticsearch
- **Kafka Streams**: Stream processing for real-time analytics
- **Schema Registry**: Avro/Protobuf schema evolution
- **Tooling**: kcat, kafka-ui, Prometheus exporters

## Event Design

### Topic Structure
| Topic | Partitions | Retention | Key | Consumers |
|-------|------------|-----------|-----|-----------|
| delivery.created | 3 | 7d | deliveryId | Dispatch |
| delivery.driver.assigned | 3 | 7d | deliveryId | Notification, Order |
| delivery.picked_up | 3 | 7d | deliveryId | Notification |
| delivery.started | 3 | 7d | deliveryId | Notification |
| delivery.completed | 3 | 7d | deliveryId | Notification |
| delivery.cancelled | 3 | 7d | deliveryId | Notification, Dispatch |
| driver.location.updated | 6 | 24h | driverId | Dispatch, AI |
| delivery.dlq | 1 | 30d | - | Ops |

### Event Envelope
```json
{
  "eventId": "uuid",
  "eventType": "DeliveryCreated",
  "version": 1,
  "occurredAt": "ISO-8601",
  "aggregateId": "uuid",
  "payload": {}
}
```

### Schema Management
- **JSON Schema**: Stored in `contracts/events/`
- **Versioning**: `version` field in envelope
- **Compatibility**: Backward compatible only (add optional fields)
- **Validation**: Consumer validates required fields

## Alternatives Considered

### RabbitMQ
**Pros**: Flexible routing, message acknowledgments, TTL, dead letter exchanges
**Cons**: 
- No log retention/replay (messages deleted after consumption)
- Clustering complexity, no horizontal scaling of queues
- Lower throughput (~100K msg/s vs millions)
- No native ordering guarantees

### AWS SQS/SNS
**Pros**: Fully managed, infinite scaling, FIFO queues
**Cons**: 
- Vendor lock-in
- No replay capability
- Limited ordering (FIFO only per group)
- Cost at scale

### gRPC Streaming / HTTP Long Polling
**Pros**: Low latency, bidirectional
**Cons**: 
- Not durable (connection loss = message loss)
- No replay
- Complex consumer scaling
- Not suitable for event sourcing

### Redis Streams
**Pros**: Built into Redis, consumer groups, blocking reads
**Cons**: 
- Limited retention (memory-bound)
- No geo-replication
- Less mature ecosystem
- Single-threaded command processing

## Consequences

### Positive
- **Reliable Event Backbone**: Foundation for event-driven architecture
- **Audit Trail**: Complete history of all business events
- **Debuggability**: Replay events to reproduce issues
- **Decoupling**: Services don't know about each other
- **Polyglot Consumers**: Java, Go, Python can all consume

### Negative
- **Operational Complexity**: Broker management, monitoring, upgrades
- **KRaft Mode**: Newer, less battle-tested than ZooKeeper
- **Schema Management**: Requires discipline, registry for production
- **Latency**: ~5-10ms end-to-end (vs <1ms for direct RPC)
- **Cost**: Disk storage for retention, replication overhead

## Configuration

### Producer (Java - Spring Kafka)
```yaml
spring:
  kafka:
    producer:
      acks: all
      retries: 3
      properties:
        enable.idempotence: true
        max.in.flight.requests.per.connection: 5
```

### Producer (Go - segmentio/kafka-go)
```go
writer := &kafka.Writer{
    RequiredAcks: kafka.RequireAll,
    Async:        false,
    Compression:  kafka.Snappy,
}
```

### Consumer
```yaml
spring:
  kafka:
    consumer:
      enable-auto-commit: false
      isolation.level: read_committed
```

## Failure Handling
- **Broker Down**: ISR reassignment, producer retries with backoff
- **Consumer Lag**: Alert on lag > threshold, scale consumers
- **Poison Pill**: DLQ after max retries, alert ops
- **Schema Violation**: Consumer logs error, sends to DLQ, continues

## Related ADRs
- ADR-004: Outbox Pattern (reliable publishing)
- ADR-010: Idempotency Strategy (consumer deduplication)
- ADR-005: Redis for Driver Location (real-time supplement)