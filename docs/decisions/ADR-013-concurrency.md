# ADR-013: Concurrency Control for Delivery State Machine

## Status
Accepted

## Context
The Delivery entity has a strict state machine with valid transitions:
```
CREATED → ASSIGNING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                              ↘ CANCELLED (from any non-terminal state)
```

Multiple concurrent requests can attempt invalid transitions:
- Two drivers trying to pick up same delivery
- Cancel request racing with pickup
- Duplicate completion requests

## Decision
Use **Optimistic Locking with Version Column** + **Application-Level State Validation**:

### 1. Database-Level Optimistic Locking
```sql
ALTER TABLE deliveries ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

-- Update with version check
UPDATE deliveries 
SET status = 'ASSIGNED', driver_id = ?, version = version + 1
WHERE id = ? AND version = ? AND status = 'ASSIGNING';
```

### 2. Application-Level State Machine
```java
public enum DeliveryStatus {
    CREATED, ASSIGNING, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED;

    public boolean canTransitionTo(DeliveryStatus newStatus) {
        return switch (this) {
            case CREATED -> newStatus == ASSIGNING || newStatus == CANCELLED;
            case ASSIGNING -> newStatus == ASSIGNED || newStatus == CANCELLED;
            case ASSIGNED -> newStatus == PICKED_UP || newStatus == CANCELLED;
            case PICKED_UP -> newStatus == IN_TRANSIT || newStatus == CANCELLED;
            case IN_TRANSIT -> newStatus == DELIVERED || newStatus == CANCELLED;
            case DELIVERED, CANCELLED -> false;
        };
    }
}
```

### 3. Service Validation
```java
@Transactional
public Delivery assignDriver(UUID deliveryId, UUID driverId, ...) {
    Delivery delivery = deliveryRepository.findById(deliveryId)
        .orElseThrow(() -> new ResourceNotFoundException("Delivery not found"));
    
    // Application-level validation (fails fast)
    if (delivery.getStatus() != DeliveryStatus.ASSIGNING) {
        throw new InvalidStateException(
            "Delivery must be in ASSIGNING status to assign driver");
    }
    
    // Optimistic lock handled by @Version
    delivery.assignDriver(driverId);
    return deliveryRepository.save(delivery);
}
```

## Why Both?

| Layer | Protects Against | Latency |
|-------|------------------|---------|
| Application Validation | Invalid state transitions (business logic) | Fast fail, no DB roundtrip |
| Optimistic Lock | Lost updates (concurrent modifications) | DB-level, prevents lost updates |

## Implementation Details

### JPA Entity
```java
@Entity
@Table(name = "deliveries")
public class Delivery {
    
    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DeliveryStatus status = DeliveryStatus.CREATED;
    
    public void assignDriver(UUID driverId) {
        if (this.status != DeliveryStatus.ASSIGNING) {
            throw new IllegalStateException("Must be ASSIGNING");
        }
        this.driverId = driverId;
        this.status = DeliveryStatus.ASSIGNED;
    }
    
    // ... other transitions
}
```

### Repository with Optimistic Lock
```java
@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    
    @Lock(LockModeType.OPTIMISTIC)
    @Query("SELECT d FROM Delivery d WHERE d.id = :id")
    Optional<Delivery> findByIdWithLock(@Param("id") UUID id);
    
    // Optimistic lock automatic on save()
}
```

### Exception Handling
```java
@ExceptionHandler(ObjectOptimisticLockingFailureException.class)
public ResponseEntity<ErrorResponse> handleOptimisticLock(
        ObjectOptimisticLockingFailureException ex, WebRequest request) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ErrorResponse.builder()
            .title("Concurrent Modification")
            .detail("Delivery was modified by another request. Please retry.")
            .build());
}
```

## Concurrency Scenarios

### Scenario 1: Double Pickup
```
Driver A                    Driver B
    │                           │
    ├─ GET delivery (v=3) ────►│
    │                           ├─ GET delivery (v=3)
    │                           │
    ├─ PICKUP (v=3→4) ────────►│
    │                           │
    │                    PICKUP (v=3) → FAIL (OptimisticLockException)
    ▼                           ▼
```

### Scenario 2: Cancel vs Pickup
```
Customer                    Driver
    │                          │
    ├─ CANCEL (v=2) ─────────►│
    │                          ├─ PICKUP (v=2) → FAIL (status=CANCELLED)
    │                          │
    ▼                          ▼
```

### Scenario 3: Duplicate Completion
```
System                      System (retry)
    │                          │
    ├─ COMPLETE (v=5→6) ─────►│
    │                          ├─ COMPLETE (v=5) → FAIL (version mismatch)
    ▼                          ▼
```

## Alternatives Considered

### Pessimistic Locking (SELECT FOR UPDATE)
```sql
SELECT * FROM deliveries WHERE id = ? FOR UPDATE;
```
**Pros**: Serializes access, no retries
**Cons**: 
- Blocks other readers
- Connection pool exhaustion under load
- Deadlock risk with multiple entities

### Distributed Lock (Redis SETNX)
```go
lock, _ := redis.SetNX(ctx, "lock:delivery:"+id, "1", 10*time.Second).Result()
```
**Pros**: Explicit control, works across services
**Cons**: 
- Additional infrastructure
- Lock lease management
- Deadlock risk if not careful

### Event Sourcing (Natural Serialization)
**Pros**: Single writer per aggregate, natural serialization
**Cons**: Overkill, complexity

## Consequences

### Positive
- **Correctness**: Invalid transitions rejected at application + DB level
- **Performance**: No blocking, fast fail for invalid transitions
- **Scalability**: No connection pooling issues from long locks
- **Audit Trail**: Version column provides modification history

### Negative
- **Retry Logic**: Clients must handle 409 Conflict with retry
- **Version Column**: Extra storage, managed by JPA
- **Exception Handling**: Need to map OptimisticLockingFailureException to 409

## Client Retry Guidance
```javascript
async function transitionDelivery(deliveryId, action) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await api.post(`/deliveries/${deliveryId}/${action}`);
        } catch (error) {
            if (error.status === 409 && attempt < 2) {
                await sleep(50 * (attempt + 1)); // Short backoff
                continue; // Retry
            }
            throw error;
        }
    }
}
```

## Related ADRs
- ADR-009: Database-per-Service (optimistic lock per service DB)
- ADR-010: Idempotency (client retry with same key)
- ADR-011: Driver Reservation (Redis SETNX for assignment)
- ADR-001: Microservices (state machine per service)