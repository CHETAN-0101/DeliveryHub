package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

type DispatchRedisClient struct {
	client *redis.Client
}

func NewDispatchRedisClient(client *redis.Client) *DispatchRedisClient {
	return &DispatchRedisClient{client: client}
}

const (
	dispatchLockPrefix        = "dispatch:lock:"
	dispatchAssignmentPrefix  = "dispatch:assignment:"
	dispatchProcessedEvents   = "dispatch:processed:"
	lockTTL                   = 30 * time.Second
	assignmentTTL             = 10 * time.Minute
	processedEventTTL         = 24 * time.Hour

	// Driver geo keys (shared with driver service)
	driverGeoKey               = "drivers:geo"
	driverStatusPrefix         = "driver:status:"
	driverLocationPrefix       = "driver:location:"
	locationFreshnessThreshold = 5 * time.Minute

	// Dispatch events / stats keys (used by the HTTP API)
	dispatchEventsListKey = "dispatch:events:list"
	dispatchStatsKey      = "dispatch:stats"
	eventsListMaxLen      = 200
)

func (d *DispatchRedisClient) AcquireDispatchLock(ctx context.Context, deliveryID uuid.UUID) (bool, error) {
	key := dispatchLockPrefix + deliveryID.String()
	return d.client.SetNX(ctx, key, "1", lockTTL).Result()
}

func (d *DispatchRedisClient) ReleaseDispatchLock(ctx context.Context, deliveryID uuid.UUID) error {
	key := dispatchLockPrefix + deliveryID.String()
	return d.client.Del(ctx, key).Err()
}

func (d *DispatchRedisClient) SaveAssignment(ctx context.Context, deliveryID, driverID uuid.UUID) error {
	key := dispatchAssignmentPrefix + deliveryID.String()
	data := fmt.Sprintf("%s|%s|%d", deliveryID.String(), driverID.String(), time.Now().Unix())
	return d.client.Set(ctx, key, data, assignmentTTL).Err()
}

func (d *DispatchRedisClient) GetAssignment(ctx context.Context, deliveryID uuid.UUID) (driverID uuid.UUID, found bool, err error) {
	key := dispatchAssignmentPrefix + deliveryID.String()
	val, err := d.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}

	// Parse format: deliveryID|driverID|timestamp
	var dID, drID string
	var ts int64
	_, err = fmt.Sscanf(val, "%s|%s|%d", &dID, &drID, &ts)
	if err != nil {
		return uuid.Nil, false, err
	}

	driverID, _ = uuid.Parse(drID)
	return driverID, true, nil
}

func (d *DispatchRedisClient) MarkEventProcessed(ctx context.Context, eventID uuid.UUID) error {
	key := dispatchProcessedEvents + eventID.String()
	return d.client.Set(ctx, key, "1", processedEventTTL).Err()
}

func (d *DispatchRedisClient) IsEventProcessed(ctx context.Context, eventID uuid.UUID) (bool, error) {
	key := dispatchProcessedEvents + eventID.String()
	_, err := d.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// FindNearbyAvailableDrivers finds drivers near a location using Redis GEOSEARCH
// Returns driver IDs that are AVAILABLE and have fresh location data
func (d *DispatchRedisClient) FindNearbyAvailableDrivers(ctx context.Context, lat, lon, radiusKm float64) ([]string, error) {
	// Search for nearby drivers using GEOSEARCH
	result, err := d.client.GeoSearch(ctx, driverGeoKey, &redis.GeoSearchQuery{
		Longitude:  lon,
		Latitude:   lat,
		Radius:     radiusKm,
		RadiusUnit: "km",
		Sort:       "ASC",
		Count:      50,
	}).Result()

	if err != nil {
		return nil, err
	}

	// Filter by availability and location freshness
	var availableDrivers []string
	for _, driverID := range result {
		if d.isDriverAvailableAndFresh(ctx, driverID) {
			availableDrivers = append(availableDrivers, driverID)
		}
	}

	return availableDrivers, nil
}

func (d *DispatchRedisClient) isDriverAvailableAndFresh(ctx context.Context, driverID string) bool {
	// Check status
	statusKey := driverStatusPrefix + driverID
	status, err := d.client.Get(ctx, statusKey).Result()
	if err != nil || status != "AVAILABLE" {
		return false
	}

	// Check location freshness
	locKey := driverLocationPrefix + driverID
	lastUpdate, err := d.client.Get(ctx, locKey+":updated").Result()
	if err != nil {
		return false
	}

	// Parse Unix timestamp
	updateSec, err := strconv.ParseInt(lastUpdate, 10, 64)
	if err != nil {
		return false
	}

	updateTime := time.Unix(updateSec, 0)
	if time.Since(updateTime) > locationFreshnessThreshold {
		return false
	}

	return true
}

// DispatchEventEntry is a JSON-serialisable dispatch event record stored in Redis.
type DispatchEventEntry struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	DeliveryID string `json:"deliveryId"`
	DriverID   string `json:"driverId,omitempty"`
	Message    string `json:"message"`
	Timestamp  string `json:"timestamp"`
}

// StoreEvent persists a dispatch event in Redis so the HTTP API can serve it.
func (d *DispatchRedisClient) StoreEvent(ctx context.Context, entry DispatchEventEntry) error {
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	pipe := d.client.Pipeline()
	pipe.LPush(ctx, dispatchEventsListKey, string(b))
	pipe.LTrim(ctx, dispatchEventsListKey, 0, int64(eventsListMaxLen-1))
	pipe.Expire(ctx, dispatchEventsListKey, 24*time.Hour)
	_, err = pipe.Exec(ctx)
	return err
}

// GetRecentEvents returns the most recent dispatch events from Redis.
func (d *DispatchRedisClient) GetRecentEvents(ctx context.Context, limit int) ([]DispatchEventEntry, error) {
	vals, err := d.client.LRange(ctx, dispatchEventsListKey, 0, int64(limit-1)).Result()
	if err == redis.Nil || len(vals) == 0 {
		return []DispatchEventEntry{}, nil
	}
	if err != nil {
		return nil, err
	}

	events := make([]DispatchEventEntry, 0, len(vals))
	for _, v := range vals {
		var e DispatchEventEntry
		if err := json.Unmarshal([]byte(v), &e); err == nil {
			events = append(events, e)
		}
	}
	return events, nil
}

// IncrStat increments a named counter in the dispatch stats hash.
func (d *DispatchRedisClient) IncrStat(ctx context.Context, field string) error {
	return d.client.HIncrBy(ctx, dispatchStatsKey, field, 1).Err()
}

// GetStats returns aggregate dispatch statistics from Redis.
func (d *DispatchRedisClient) GetStats(ctx context.Context) (map[string]interface{}, error) {
	vals, err := d.client.HGetAll(ctx, dispatchStatsKey).Result()
	if err == redis.Nil || len(vals) == 0 {
		return map[string]interface{}{
			"started": 0, "assigned": 0, "completed": 0,
			"failed": 0, "retried": 0, "successRate": 0.0,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	toInt := func(s string) int {
		n, _ := strconv.Atoi(s)
		return n
	}

	started := toInt(vals["started"])
	assigned := toInt(vals["assigned"])
	completed := toInt(vals["completed"])
	failed := toInt(vals["failed"])
	retried := toInt(vals["retried"])

	var successRate float64
	if started > 0 {
		successRate = float64(completed) / float64(started) * 100
	}

	return map[string]interface{}{
		"started":     started,
		"assigned":    assigned,
		"completed":   completed,
		"failed":      failed,
		"retried":     retried,
		"successRate": successRate,
	}, nil
}