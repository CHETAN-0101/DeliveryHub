package redis

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
)

type GeoRepository struct {
	client *redis.Client
}

func NewGeoRepository(client *redis.Client) *GeoRepository {
	return &GeoRepository{client: client}
}

const (
	driverGeoKey       = "drivers:geo"
	driverStatusPrefix = "driver:status:"
	driverLocationPrefix = "driver:location:"
	reservationPrefix  = "driver:reservation:"
	locationFreshnessThreshold = 5 * time.Minute
)

func (r *GeoRepository) AddDriverLocation(ctx context.Context, driverID string, lat, lon float64) error {
	return r.client.GeoAdd(ctx, driverGeoKey, &redis.GeoLocation{
		Name:      driverID,
		Longitude: lon,
		Latitude:  lat,
	}).Err()
}

func (r *GeoRepository) RemoveDriverLocation(ctx context.Context, driverID string) error {
	return r.client.ZRem(ctx, driverGeoKey, driverID).Err()
}

func (r *GeoRepository) FindNearbyDrivers(ctx context.Context, lat, lon float64, radiusKm float64) ([]string, error) {
	result, err := r.client.GeoSearch(ctx, driverGeoKey, &redis.GeoSearchQuery{
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
	
	// Filter by availability and freshness
	var availableDrivers []string
	for _, driverID := range result {
		if r.isDriverAvailableAndFresh(ctx, driverID) {
			availableDrivers = append(availableDrivers, driverID)
		}
	}
	
	return availableDrivers, nil
}

func (r *GeoRepository) isDriverAvailableAndFresh(ctx context.Context, driverID string) bool {
	// Check status
	statusKey := driverStatusPrefix + driverID
	status, err := r.client.Get(ctx, statusKey).Result()
	if err != nil || status != "AVAILABLE" {
		return false
	}

	// Check location freshness
	locKey := driverLocationPrefix + driverID
	lastUpdate, err := r.client.Get(ctx, locKey+":updated").Result()
	if err != nil {
		return false
	}

	updateTime, err := strconv.ParseInt(lastUpdate, 10, 64)
	if err != nil {
		return false
	}

	if time.Since(time.Unix(updateTime, 0)) > locationFreshnessThreshold {
		return false
	}

	return true
}

func (r *GeoRepository) SetDriverStatus(ctx context.Context, driverID string, status string) error {
	return r.client.Set(ctx, driverStatusPrefix+driverID, status, 24*time.Hour).Err()
}

func (r *GeoRepository) GetDriverStatus(ctx context.Context, driverID string) (string, error) {
	return r.client.Get(ctx, driverStatusPrefix+driverID).Result()
}

func (r *GeoRepository) UpdateDriverLocationCache(ctx context.Context, driverID string, lat, lon float64) error {
	pipe := r.client.Pipeline()
	pipe.Set(ctx, driverLocationPrefix+driverID+":lat", fmt.Sprintf("%f", lat), 24*time.Hour)
	pipe.Set(ctx, driverLocationPrefix+driverID+":lon", fmt.Sprintf("%f", lon), 24*time.Hour)
	pipe.Set(ctx, driverLocationPrefix+driverID+":updated", fmt.Sprintf("%d", time.Now().Unix()), 24*time.Hour)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *GeoRepository) GetDriverLocationCache(ctx context.Context, driverID string) (lat, lon float64, found bool) {
	latStr, err1 := r.client.Get(ctx, driverLocationPrefix+driverID+":lat").Result()
	lonStr, err2 := r.client.Get(ctx, driverLocationPrefix+driverID+":lon").Result()
	
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	
	lat, _ = strconv.ParseFloat(latStr, 64)
	lon, _ = strconv.ParseFloat(lonStr, 64)
	return lat, lon, true
}

// ReserveDriver atomically reserves a driver using Redis SETNX
// Returns true if reservation succeeded, false if driver already reserved
func (r *GeoRepository) ReserveDriver(ctx context.Context, driverID, deliveryID string, ttl time.Duration) (bool, error) {
	key := reservationPrefix + driverID
	// SETNX with TTL - atomic reservation
	success, err := r.client.SetNX(ctx, key, deliveryID, ttl).Result()
	return success, err
}

// ReleaseDriverReservation releases a driver reservation
func (r *GeoRepository) ReleaseDriverReservation(ctx context.Context, driverID string) error {
	key := reservationPrefix + driverID
	return r.client.Del(ctx, key).Err()
}

// GetDriverReservation returns the delivery ID if driver is reserved
func (r *GeoRepository) GetDriverReservation(ctx context.Context, driverID string) (string, bool) {
	key := reservationPrefix + driverID
	val, err := r.client.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return val, true
}

// ExtendDriverReservation extends the TTL of a reservation
func (r *GeoRepository) ExtendDriverReservation(ctx context.Context, driverID string, ttl time.Duration) error {
	key := reservationPrefix + driverID
	return r.client.Expire(ctx, key, ttl).Err()
}