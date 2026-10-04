package redis

import (
	"context"
	"fmt"
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
	dispatchLockPrefix     = "dispatch:lock:"
	dispatchAssignmentPrefix = "dispatch:assignment:"
	dispatchProcessedEvents = "dispatch:processed:"
	lockTTL                = 30 * time.Second
	assignmentTTL          = 10 * time.Minute
	processedEventTTL      = 24 * time.Hour
)

// AcquireDispatchLock tries to acquire a lock for processing a delivery
func (d *DispatchRedisClient) AcquireDispatchLock(ctx context.Context, deliveryID uuid.UUID) (bool, error) {
	key := dispatchLockPrefix + deliveryID.String()
	return d.client.SetNX(ctx, key, "1", lockTTL).Result()
}

// ReleaseDispatchLock releases the dispatch lock
func (d *DispatchRedisClient) ReleaseDispatchLock(ctx context.Context, deliveryID uuid.UUID) error {
	key := dispatchLockPrefix + deliveryID.String()
	return d.client.Del(ctx, key).Err()
}

// SaveAssignment saves the driver assignment
func (d *DispatchRedisClient) SaveAssignment(ctx context.Context, deliveryID, driverID uuid.UUID) error {
	key := dispatchAssignmentPrefix + deliveryID.String()
	data := fmt.Sprintf("%s|%s|%d", deliveryID.String(), driverID.String(), time.Now().Unix())
	return d.client.Set(ctx, key, data, assignmentTTL).Err()
}

// GetAssignment retrieves the assignment
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

// MarkEventProcessed marks an event as processed (for idempotency)
func (d *DispatchRedisClient) MarkEventProcessed(ctx context.Context, eventID uuid.UUID) error {
	key := dispatchProcessedEvents + eventID.String()
	return d.client.Set(ctx, key, "1", processedEventTTL).Err()
}

// IsEventProcessed checks if an event was already processed
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