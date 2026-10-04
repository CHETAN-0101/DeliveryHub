# ADR-005: Redis for Driver Location and Caching

## Status
Accepted

## Context
Driver Service handles high-frequency location updates (1-5 Hz per driver) and needs to support:
1. Real-time driver location tracking
- 10,000+ concurrent drivers
- Sub-second query latency for "find nearby available drivers"
- Atomic driver reservation for dispatch

Traditional PostgreSQL cannot handle this write/read pattern efficiently.

## Decision
Use Redis as the primary data store for:
1. **Geo-spatial Index** (Sorted Sets with GEO commands) for nearby driver queries
2. **Driver Status Cache** (String keys) for availability
3. **Location Cache** (String keys) for last-known position
4. **Atomic Reservations** (SETNX with TTL) for driver assignment
5. **Rate Limiting** (Sorted Sets) for API Gateway

PostgreSQL remains the system of record for durable driver data.

## Data Model

### Geo Index: `drivers:geo` (Sorted Set)
```redis
GEOADD drivers:geo -74.0060 40.7128 "driver-uuid-1"
GEOADD drivers:geo -73.9851 40.7589 "driver-uuid-2"
```
- **Query**: `GEORADIUS drivers:geo -74.0060 40.7128 5 km WITHDIST ASC COUNT 50`
- **Complexity**: O(log N + M) where M = results returned
- **Updates**: `GEOADD` on each location update (overwrites)

### Status Cache: `driver:status:{driverId}` (String)
```
driver:status:uuid-1 → "AVAILABLE" (TTL 24h)
driver:status:uuid-2 → "BUSY" (TTL 24h)
```
- **Update**: `SET driver:status:uuid-1 AVAILABLE EX 86400`
- **Query**: `GET driver:status:uuid-1`

### Location Cache: `driver:location:{driverId}:lat/lon/updated` (String)
```
driver:location:uuid-1:lat → "40.7128"
driver:location:uuid-1:lon → "-74.0060"
driver:location:uuid-1:updated → "1705312200" (Unix timestamp)
```
- **Pipeline Write**: `MSET` all three keys with `EX 86400`
- **Query**: `MGET` all three keys
- **Freshness Check**: Compare `updated` timestamp with threshold

### Reservation Lock: `driver:reservation:{driverId}` (String with TTL)
```
driver:reservation:uuid-1 → "delivery-uuid-123" (TTL 5min)
```
- **Acquire**: `SETNX driver:reservation:uuid-1 delivery-uuid-123 EX 300`
- **Release**: `DEL driver:reservation:uuid-1`
- **Extend**: `EXPIRE driver:reservation:uuid-1 300`

### Rate Limiting: `ratelimit:user:{userId}` / `ratelimit:ip:{ip}` (Sorted Set)
```
ratelimit:user:uuid-1 → "1705312200-request-id" (score = timestamp)
```
- **Window**: Sliding 1-second window using `ZREMRANGEBYSCORE`
- **Count**: `ZCARD` for current requests
- **Cleanup**: `EXPIRE` 2 seconds

## Alternatives Considered

### PostgreSQL with PostGIS
**Pros**: ACID, single source of truth, rich spatial queries
**Cons**: 
- Write throughput: ~1K inserts/sec vs Redis 100K+
- Geo queries slower (index maintenance)
- Connection pooling overhead for high-frequency updates
- No atomic SETNX equivalent for reservations

### In-Memory Map (Go map + mutex)
**Pros**: Zero dependencies, fastest possible
**Cons**: 
- Not shared across service instances
- No persistence across restarts
- No TTL/expiration built-in
- Manual sharding for scale

### Cassandra/ScyllaDB
**Pros**: High write throughput, distributed
**Cons**: 
- No native geo-spatial queries
- Operational complexity
- Overkill for current location only (not history)

### Custom Geohash + PostgreSQL
**Pros**: Uses existing DB, geohash prefix for proximity
**Cons**: 
- Approximate proximity (geohash boundaries)
- Still limited by PostgreSQL write throughput
- Complex indexing strategy

## Consequences

### Positive
- **Performance**: 100K+ location updates/sec, sub-ms geo queries
- **Atomic Operations**: SETNX for reservations, pipelines for bulk
- **TTL/Expiration**: Automatic cleanup of stale data
- **Horizontal Scaling**: Redis Cluster for geo sharding
- **Multi-purpose**: Geo, cache, locks, rate limits in one system

### Negative
- **Eventual Consistency**: Redis = source of truth for "now", PostgreSQL = durable
- **Data Loss Risk**: Redis restart loses non-persisted data (mitigated by AOF)
- **Memory Bound**: All hot data must fit in RAM
- **Additional Infrastructure**: Redis Cluster for production
- **Split Brain**: Network partition can cause inconsistent state

## Consistency Model

| Data | Source of Truth | Consistency |
|------|----------------|-------------|
| Driver Profile | PostgreSQL | Strong |
| Driver Status | Redis (primary), PostgreSQL (async) | Eventual |
| Current Location | Redis (primary), PostgreSQL (batched async) | Eventual |
| Reservation | Redis (atomic) | Strong (Redis) |
| Location History | PostgreSQL | Strong |

### Sync Strategy
```go
// On location update
func updateLocation(driverID, lat, lon) {
    // 1. Redis (immediate, for queries)
    redis.GeoAdd("drivers:geo", ...)
    redis.MSet(locationCache...)
    
    // 2. PostgreSQL (async, batched)
    locationQueue.Enqueue(LocationRecord{driverID, lat, lon, time.Now()})
}

// Background worker
func persistLocations() {
    batch := locationQueue.DequeueBatch(100)
    pg.BatchInsert(batch)
}
```

## Failure Handling

### Redis Unavailable
- **Read**: Fallback to PostgreSQL (stale but functional)
- **Write**: Queue locally, retry with backoff
- **Assignment**: Fail fast, return error to dispatch

### Redis Restart (Data Loss)
- **AOF/RDB**: Configure `appendonly yes`, `save 900 1`
- **Rehydration**: On startup, reload from PostgreSQL
```go
func rehydrateFromPostgres() {
    drivers := pg.GetActiveDrivers()
    for _, d := range drivers {
        if d.CurrentLat != nil && d.CurrentLon != nil {
            redis.GeoAdd("drivers:geo", d.CurrentLon, d.CurrentLat, d.ID)
            redis.SetStatus(d.ID, d.Status)
        }
    }
}
```

### Network Partition
- **Client-side**: Retry with exponential backoff
- **Reservation**: TTL auto-expires, no manual cleanup needed
- **Rate Limit**: Fail open (allow request) to avoid blocking legitimate traffic

## Scaling

### Redis Cluster (Production)
- **Sharding**: 16384 hash slots across master nodes
- **Geo Commands**: Work with single key (`drivers:geo`) → single slot
- **Replication**: 1 master + 2 replicas per shard
- **Failover**: Automatic via Redis Sentinel/Cluster

### Memory Planning
| Data | Est. Size (10K drivers) |
|------|------------------------|
| Geo Index | ~2 MB |
| Status Cache | ~1 MB |
| Location Cache | ~3 MB |
| Reservations | ~500 KB |
| Rate Limits | ~10 MB |
| **Total** | **~17 MB** (well within limits) |

## Related ADRs
- ADR-013: Driver Reservation Concurrency (uses SETNX)
- ADR-003: Kafka (location events optional supplement)
- ADR-009: Database-per-Service (PostgreSQL remains system of record)