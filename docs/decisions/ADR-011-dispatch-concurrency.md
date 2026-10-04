# ADR-011: Driver Reservation Concurrency Control

## Status
Accepted

## Context
The Dispatch Service assigns drivers to deliveries. Multiple dispatch workers (horizontal scaling) may attempt to reserve the same available driver simultaneously. This must be handled without race conditions.

**Race Condition Scenario**:
```
Worker 1                          Worker 2
    │                                 │
    ├─ Find available drivers ───────►│ (both see Driver A as available)
    │                                 │
    ├─ Reserve Driver A ─────────────►│ (both try to reserve)
    │                                 │
    ▼                                 ▼
```

If both succeed, Driver A gets two deliveries.

## Decision
Use **Redis Atomic Reservation (SETNX with TTL)** for driver assignment:

```go
// Single atomic operation
success, err := redis.SetNX(ctx, 
    "driver:reservation:"+driverID, 
    deliveryID, 
    5*time.Minute).Result()

if success {
    // Got exclusive reservation
    proceedWithAssignment(driverID, deliveryID)
} else {
    // Driver already reserved by another worker
    tryNextDriver()
}
```

## Why This Works

### Atomicity
- `SETNX` (SET if Not eXists) is atomic in Redis (single-threaded)
- No check-then-act race: the check AND set happen in one operation
- No distributed lock service needed (Redis IS the lock service)

### TTL Auto-Expiry
- Reservation auto-releases after 5 minutes (configurable)
- Handles worker crashes, network partitions, forgotten releases
- No manual cleanup required

### Simplicity
- Single Redis command
- No Lua scripts needed
- No lock manager library

## Implementation Details

### Reservation Key
```
driver:reservation:{driverId} → {deliveryId} (TTL: 5min)
```

### Acquisition Flow
```go
func (s *DispatchService) tryAssignDriver(ctx context.Context, deliveryID uuid.UUID, driverIDs []string) (uuid.UUID, error) {
    for _, driverID := range driverIDs {
        // Try atomic reservation
        reserved, err := s.redisClient.ReserveDriver(ctx, driverID, deliveryID.String(), 5*time.Minute)
        if err != nil {
            log.Error("Redis error", err)
            continue // Try next driver
        }
        
        if reserved {
            // Got it! Confirm with Driver Service
            if err := s.confirmAssignment(ctx, driverID, deliveryID); err != nil {
                // Release reservation on failure
                s.redisClient.ReleaseDriverReservation(ctx, driverID)
                continue
            }
            return uuid.MustParse(driverID), nil
        }
        // Else: already reserved, try next
    }
    return uuid.Nil, ErrNoDriversAvailable
}
```

### Release on Failure
```go
// If assignment fails after reservation
if err := s.confirmAssignment(ctx, driverID, deliveryID); err != nil {
    // Release so driver becomes available again
    s.redisClient.ReleaseDriverReservation(ctx, driverID)
    return err
}
```

### Extension (Long Assignments)
```go
// If assignment takes longer than TTL
func (s *DispatchService) extendReservation(ctx context.Context, driverID string) error {
    return s.redisClient.ExtendDriverReservation(ctx, driverID, 5*time.Minute)
}
```

## Alternatives Considered

### Database Row Lock (SELECT FOR UPDATE)
```sql
BEGIN;
SELECT * FROM drivers WHERE id = ? AND status = 'AVAILABLE' FOR UPDATE;
UPDATE drivers SET status = 'RESERVED' WHERE id = ?;
COMMIT;
```
**Pros**: Strong consistency, ACID
**Cons**: 
- Database contention under high load
- Long-running transactions
- Connection pooling pressure
- Doesn't work well with horizontal scaling

### Distributed Lock (Redlock / etcd / Consul)
**Pros**: Formal lock semantics, lease renewal
**Cons**: 
- Additional infrastructure (etcd/Consul cluster)
- Complex implementation (Redlock algorithm)
- Overkill for simple reservation

### Optimistic Locking (Version Column)
```sql
UPDATE drivers SET status = 'RESERVED', version = version + 1 
WHERE id = ? AND status = 'AVAILABLE' AND version = ?;
```
**Pros**: No locks, works with read replicas
**Cons**: 
- High contention → many retries
- Requires retry logic with backoff
- Doesn't prevent two workers from reading same version

### Application-Level Mutex (Go sync.Mutex)
**Pros**: Simple
**Cons**: 
- Only works within single process
- Doesn't work with horizontal scaling (multiple workers)

## Consequences

### Positive
- **Correctness**: Guaranteed single assignment per driver
- **Performance**: Sub-millisecond Redis operation
- **Scalability**: Works with any number of dispatch workers
- **Fault Tolerance**: TTL handles crashes, no deadlocks
- **Simplicity**: 3 lines of code for core logic

### Negative
- **Eventual Consistency**: Brief window where driver shows AVAILABLE in Redis but RESERVED in PostgreSQL
- **Redis Dependency**: Reservation fails if Redis down (fail closed)
- **TTL Tuning**: Too short = premature expiry, too long = slow recovery
- **No Lock Renewal**: If assignment > 5min, reservation expires (mitigated by extension)

## TTL Tuning

| Scenario | TTL | Rationale |
|----------|-----|-----------|
| Standard | 5 min | Assignment typically < 30s |
| High Latency | 10 min | Cross-region, slow Driver Service |
| Batch Assignment | 1 min | Fast failover to next driver |

## Monitoring

### Metrics
```prometheus
driver_reservation_attempts_total{result="success|failure|redis_error"}
driver_reservation_duration_seconds
driver_reservation_conflicts_total
driver_reservation_ttl_expirations_total
```

### Alerts
- `driver_reservation_conflicts_total > 100/min` → High contention, add drivers
- `driver_reservation_redis_error_total > 0` → Redis issue

## Failure Scenarios

| Scenario | Behavior |
|----------|----------|
| Redis down | Fail fast, return error, dispatch retries |
| Worker crashes after SETNX | TTL expires, driver becomes available |
| Network partition | TTL expires on both sides, one wins |
| Assignment confirmation fails | Explicit `DEL` releases reservation |
| TTL expires during assignment | Extension or re-reservation |

## Related ADRs
- ADR-005: Redis for Driver Location (same Redis instance)
- ADR-003: Kafka (dispatch triggered by events)
- ADR-004: Outbox Pattern (assignment confirmation events)
- ADR-013: Concurrency (broader concurrency discussion)