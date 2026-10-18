package redis

import (
	"context"
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
	driverGeoKey              = "drivers:geo"
	driverStatusPrefix        = "driver:status:"
	driverLocationPrefix      = "driver:location:"
	locationFreshnessThreshold = 5 * time.Minute
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