package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/deliveryhub/dispatch-service/internal/model"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

type DispatchRedisClient struct {
	client *redis.Client
}

func NewDispatchRedisClient(client *redis.Client) *DispatchRedisClient {
	return &DispatchRedisClient{client: client}
}

// Event processing tracking
func (r *DispatchRedisClient) IsEventProcessed(ctx context.Context, eventID uuid.UUID) (bool, error) {
	key := fmt.Sprintf("event:processed:%s", eventID.String())
	result, err := r.client.Exists(ctx, key).Result()
	return result > 0, err
}

func (r *DispatchRedisClient) MarkEventProcessed(ctx context.Context, eventID uuid.UUID) error {
	key := fmt.Sprintf("event:processed:%s", eventID.String())
	return r.client.Set(ctx, key, "1", 24*time.Hour).Err()
}

// Dispatch locking
func (r *DispatchRedisClient) AcquireDispatchLock(ctx context.Context, deliveryID uuid.UUID) (bool, error) {
	key := fmt.Sprintf("lock:dispatch:%s", deliveryID.String())
	return r.client.SetNX(ctx, key, "1", 30*time.Second).Result()
}

func (r *DispatchRedisClient) ReleaseDispatchLock(ctx context.Context, deliveryID uuid.UUID) error {
	key := fmt.Sprintf("lock:dispatch:%s", deliveryID.String())
	return r.client.Del(ctx, key).Err()
}

// Assignment storage
func (r *DispatchRedisClient) SaveAssignment(ctx context.Context, deliveryID, driverID uuid.UUID) error {
	key := fmt.Sprintf("assignment:%s", deliveryID.String())
	data := map[string]interface{}{
		"delivery_id": deliveryID.String(),
		"driver_id":   driverID.String(),
		"assigned_at": time.Now().Unix(),
		"status":      "PENDING",
	}
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return r.client.Set(ctx, key, dataJSON, 24*time.Hour).Err()
}

func (r *DispatchRedisClient) GetAssignment(ctx context.Context, deliveryID uuid.UUID) (*model.DispatchAssignment, error) {
	key := fmt.Sprintf("assignment:%s", deliveryID.String())
	data, err := r.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var assignment model.DispatchAssignment
	if err := json.Unmarshal([]byte(data), &assignment); err != nil {
		return nil, err
	}
	return &assignment, nil
}

// Saga state management
func (r *DispatchRedisClient) SaveSaga(ctx context.Context, saga *model.AssignmentSaga) error {
	key := fmt.Sprintf("saga:%s", saga.SagaID.String())
	data, err := json.Marshal(saga)
	if err != nil {
		return err
	}
	return r.client.Set(ctx, key, data, 24*time.Hour).Err()
}

func (r *DispatchRedisClient) GetSaga(ctx context.Context, sagaID uuid.UUID) (*model.AssignmentSaga, error) {
	key := fmt.Sprintf("saga:%s", sagaID.String())
	data, err := r.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var saga model.AssignmentSaga
	if err := json.Unmarshal([]byte(data), &saga); err != nil {
		return nil, err
	}
	return &saga, nil
}

func (r *DispatchRedisClient) UpdateSagaState(ctx context.Context, sagaID uuid.UUID, state model.SagaState) error {
	key := fmt.Sprintf("saga:%s", sagaID.String())
	saga, err := r.GetSaga(ctx, sagaID)
	if err != nil {
		return err
	}
	if saga == nil {
		return fmt.Errorf("saga not found: %s", sagaID)
	}

	saga.State = state
	saga.UpdatedAt = time.Now()
	if state == model.SagaStateCompleted || state == model.SagaStateFailed {
		now := time.Now()
		saga.CompletedAt = &now
	}
	return r.SaveSaga(ctx, saga)
}

// Dead Letter Queue
func (r *DispatchRedisClient) AddToDLQ(ctx context.Context, event *model.DeadLetterEvent) error {
	key := fmt.Sprintf("dlq:%s", event.OriginalTopic)
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return r.client.LPush(ctx, key, data).Err()
}

func (r *DispatchRedisClient) GetDLQEvents(ctx context.Context, topic string, limit int64) ([]*model.DeadLetterEvent, error) {
	key := fmt.Sprintf("dlq:%s", topic)
	values, err := r.client.LRange(ctx, key, 0, limit-1).Result()
	if err != nil {
		return nil, err
	}

	var events []*model.DeadLetterEvent
	for _, v := range values {
		var event model.DeadLetterEvent
		if err := json.Unmarshal([]byte(v), &event); err == nil {
			events = append(events, &event)
		}
	}
	return events, nil
}

func (r *DispatchRedisClient) RemoveFromDLQ(ctx context.Context, topic string, event *model.DeadLetterEvent) error {
	key := fmt.Sprintf("dlq:%s", topic)
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return r.client.LRem(ctx, key, 1, data).Err()
}

// Retry tracking
func (r *DispatchRedisClient) IncrementRetryCount(ctx context.Context, eventID uuid.UUID) (int, error) {
	key := fmt.Sprintf("retry:%s", eventID.String())
	count, err := r.client.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	r.client.Expire(ctx, key, 24*time.Hour)
	return int(count), err
}

func (r *DispatchRedisClient) GetRetryCount(ctx context.Context, eventID uuid.UUID) (int, error) {
	key := fmt.Sprintf("retry:%s", eventID.String())
	count, err := r.client.Get(ctx, key).Int()
	if err == redis.Nil {
		return 0, nil
	}
	return count, err
}