# ADR-010: Idempotency Strategy

## Status
Accepted

## Context
Distributed systems must handle duplicate requests gracefully. Network retries, client bugs, and load balancer behavior can cause the same request to be processed multiple times. This is especially critical for:
- **Delivery Creation**: Duplicate deliveries = confused customers, double dispatch
- **Payment Processing**: Double charges
- **State Transitions**: Double assignment, double completion

## Decision
Implement **Application-Level Idempotency Keys** with **Database-Enforced Uniqueness**:

1. **Client sends `Idempotency-Key` header** (UUID or client-generated unique string)
2. **Server computes request hash** (SHA-256 of canonical request body)
3. **Check database** for existing key with same hash
4. **If found**: Return cached response (200 OK)
5. **If not found**: Process request, store key+hash+response, return response
6. **Database Constraint**: `PRIMARY KEY (idempotency_key)` enforces uniqueness

## Implementation

### HTTP Header
```http
POST /api/v1/deliveries
Idempotency-Key: delivery-create-550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "pickupAddress": "123 Main St",
  ...
}
```

### Server-Side (Order Service)
```java
@PostMapping("/deliveries")
public ResponseEntity<DeliveryResponse> createDelivery(
        @RequestBody CreateDeliveryRequest request,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
    
    if (idempotencyKey != null) {
        String requestHash = computeRequestHash(request);
        
        // Check existing (atomic read)
        Optional<IdempotencyRecord> existing = idempotencyRepository
            .findByIdempotencyKey(idempotencyKey);
        
        if (existing.isPresent()) {
            IdempotencyRecord record = existing.get();
            if (record.isExpired()) {
                idempotencyRepository.delete(record);
            } else if (record.getRequestHash().equals(requestHash)) {
                // Return cached response
                return ResponseEntity.ok()
                    .header(HttpHeaders.ETAG, "\"" + idempotencyKey + "\"")
                    .body(cachedResponse(record));
            } else {
                // Same key, different request
                throw new IdempotencyException("Idempotency key reused with different request");
            }
        }
    }
    
    // Process request
    Delivery delivery = deliveryService.createDelivery(...);
    DeliveryResponse response = mapToResponse(delivery);
    
    // Store idempotency record
    if (idempotencyKey != null) {
        String requestHash = computeRequestHash(request);
        idempotencyService.saveIdempotencyResult(
            idempotencyKey, requestHash, 
            objectMapper.writeValueAsString(response), 
            HttpStatus.CREATED.value(), 24);
    }
    
    return ResponseEntity.status(HttpStatus.CREATED).body(response);
}
```

### Database Schema
```sql
CREATE TABLE idempotency_records (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL,
    response_body JSONB,
    response_status INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_expires_at ON idempotency_records(expires_at);
```

### TTL & Cleanup
- **TTL**: 24 hours (configurable)
- **Cleanup Job**: `@Scheduled` deletes expired records hourly
- **Storage**: ~1KB per record, minimal impact

## Kafka Consumer Idempotency

For event processing, use **Event ID Deduplication**:

```go
func (c *Consumer) processEvent(msg kafka.Message) error {
    var event EventEnvelope
    json.Unmarshal(msg.Value, &event)
    
    // Deduplicate using Redis SETNX
    processed, err := redis.SetNX(ctx, 
        "processed:"+event.EventID, 
        "1", 
        24*time.Hour).Result()
    
    if err != nil {
        return err // Redis error, retry
    }
    
    if !processed {
        log.Info("Duplicate event skipped", "eventId", event.EventID)
        return nil // Already processed
    }
    
    // Process event
    return handleEvent(event)
}
```

### Natural Idempotency
Some operations are naturally idempotent:
- `UPDATE delivery SET status = 'ASSIGNED' WHERE id = ? AND status = 'ASSIGNING'`
- `INSERT INTO notifications ... ON CONFLICT DO NOTHING`
- Setting status to same value twice = no-op

## Alternatives Considered

### No Idempotency (Rely on Client)
**Pros**: Simpler server
**Cons**: 
- Client bugs cause duplicates
- Network retries unavoidable
- Load balancer retries on timeout

### Database-Only (Unique Constraints on Business Keys)
**Pros**: Simpler, no extra table
**Cons**: 
- Only works for unique business keys (e.g., email)
- Can't handle "same request, different outcome" scenarios
- No request/response caching

### Distributed Lock (Redis SETNX)
**Pros**: Prevents concurrent processing
**Cons**: 
- Doesn't handle retries after success
- Lock contention under load
- Doesn't cache response

### Event Sourcing (Natural Idempotency)
**Pros**: Event log is source of truth
**Cons**: Overkill, complexity

## Consequences

### Positive
- **Safe Retries**: Clients can retry aggressively without side effects
- **Exactly-Once Semantics**: Combined with idempotent consumers
- **Client Control**: Clients choose key (business meaning)
- **Audit Trail**: Idempotency records show retry patterns
- **Standards Compliant**: Follows RFC 9457, IETF idempotency-key draft

### Negative
- **Storage Overhead**: ~1KB per request (minimal)
- **Latency**: Extra DB lookup (mitigated by index)
- **Key Management**: Clients must generate unique keys
- **Hash Collision**: SHA-256 collision probability negligible (2^-256)
- **TTL Management**: Cleanup job required

## Client Guidelines

### Key Generation
```javascript
// Good: UUID per user action
const idempotencyKey = `delivery-create-${userId}-${Date.now()}-${crypto.randomUUID()}`;

// Good: Business meaningful
const idempotencyKey = `order-${cartId}-${userId}`;

// Bad: Random per request (defeats purpose)
const idempotencyKey = crypto.randomUUID();
```

### Retry Logic
```javascript
async function createDelivery(payload) {
    const key = generateIdempotencyKey();
    
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch('/api/v1/deliveries', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': key
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok || response.status === 409) {
                return response; // Success or conflict (same key, different payload)
            }
            
            // Retry on 5xx, 429
        } catch (error) {
            // Retry on network error
        }
        
        await sleep(2 ** attempt * 1000); // Exponential backoff
    }
}
```

## Monitoring

### Metrics
```prometheus
# Idempotency hits/misses
idempotency_requests_total{result="hit|miss|conflict|error"}

# Storage
idempotency_records_active
idempotency_cleanup_duration_seconds
```

### Alerts
- `idempotency_requests_total{result="conflict"} > 0` → Client bug
- `idempotency_records_active > threshold` → Cleanup issue

## Related ADRs
- ADR-004: Outbox Pattern (producer side reliability)
- ADR-003: Kafka (consumer side deduplication)
- ADR-009: Database-per-Service (idempotency table per service)