package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/deliveryhub/dispatch-service/internal/grpc"
	"github.com/deliveryhub/dispatch-service/internal/model"
	"github.com/deliveryhub/dispatch-service/pkg/kafka"
	"github.com/deliveryhub/dispatch-service/pkg/redis"
	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"
)

const (
	MaxRetries            = 5
	BaseRetryDelay        = 30 * time.Second
	MaxRetryDelay         = 30 * time.Minute
	DriverReservationTTL  = 5 * time.Minute
	SagaTimeout           = 10 * time.Minute
	MaxAssignmentDistance = 50.0 // km
)

type DispatchService struct {
	redisClient           *redis.DispatchRedisClient
	kafkaConsumer         *kafka.Consumer
	kafkaPublisher        *kafka.Publisher
	driverServiceGRPCAddr string
	driverServiceClient   *grpc.DriverServiceClient
	orderServiceURL       string
	maxDistanceKm         float64
}

func NewDispatchService(
	redisClient *redis.DispatchRedisClient,
	kafkaConsumer *kafka.Consumer,
	kafkaPublisher *kafka.Publisher,
	driverServiceGRPCAddr string,
	orderServiceURL string,
	maxDistanceKm float64,
) *DispatchService {
	driverClient, err := grpc.NewDriverServiceClient(driverServiceGRPCAddr)
	if err != nil {
		log.Printf("Warning: failed to create driver service gRPC client: %v", err)
	}

	return &DispatchService{
		redisClient:           redisClient,
		kafkaConsumer:         kafkaConsumer,
		kafkaPublisher:        kafkaPublisher,
		driverServiceGRPCAddr: driverServiceGRPCAddr,
		driverServiceClient:   driverClient,
		orderServiceURL:       orderServiceURL,
		maxDistanceKm:         maxDistanceKm,
	}
}

func (s *DispatchService) Start(ctx context.Context) error {
	log.Println("Starting dispatch service consumer...")

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := s.kafkaConsumer.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				log.Printf("Kafka read error: %v", err)
				time.Sleep(time.Second)
				continue
			}

			if err := s.processMessage(ctx, msg); err != nil {
				log.Printf("Failed to process message: %v", err)
				// In production, send to DLQ
			}
		}
	}
}

func (s *DispatchService) processMessage(ctx context.Context, msg kafkago.Message) error {
	var event model.DeliveryCreatedEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		return fmt.Errorf("failed to unmarshal event: %w", err)
	}

	// Check idempotency
	processed, err := s.redisClient.IsEventProcessed(ctx, event.EventID)
	if err != nil {
		return err
	}
	if processed {
		log.Printf("Event %s already processed, skipping", event.EventID)
		return nil
	}

	// Create saga for this assignment
	saga := &model.AssignmentSaga{
		SagaID:      uuid.New(),
		DeliveryID:  event.AggregateID,
		State:       model.SagaStateStarted,
		CurrentStep: 0,
		RetryCount:  0,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.redisClient.SaveSaga(ctx, saga); err != nil {
		return fmt.Errorf("failed to create saga: %w", err)
	}

	// Process with saga tracking
	if err := s.processDeliveryAssignment(ctx, saga, event); err != nil {
		s.handleAssignmentFailure(ctx, saga, err)
		return err
	}

	return nil
}

func (s *DispatchService) processDeliveryAssignment(ctx context.Context, saga *model.AssignmentSaga, event model.DeliveryCreatedEvent) error {
	// Step 1: Find nearby drivers
	saga.State = model.SagaStateFinding
	saga.CurrentStep = 1
	saga.UpdatedAt = time.Now()
	s.redisClient.SaveSaga(ctx, saga)

	driverCandidates, err := s.findNearbyDrivers(ctx, event.Payload.PickupLatitude, event.Payload.PickupLongitude)
	if err != nil {
		return fmt.Errorf("failed to find nearby drivers: %w", err)
	}

	if len(driverCandidates) == 0 {
		return s.handleNoDriversAvailable(ctx, event)
	}

	// Step 2: Score and rank drivers
	saga.State = model.SagaStateReserving
	saga.CurrentStep = 2
	saga.UpdatedAt = time.Now()
	s.redisClient.SaveSaga(ctx, saga)

	// Score and rank candidates
	scoredCandidates := s.scoreDrivers(ctx, driverCandidates, event.Payload.PickupLatitude, event.Payload.PickupLongitude, event.Payload.PackageWeight)

	// Step 3: Try to reserve a driver with scoring-based selection
	saga.State = model.SagaStateConfirming
	saga.CurrentStep = 3
	saga.UpdatedAt = time.Now()
	s.redisClient.SaveSaga(ctx, saga)

	var assignedDriverID uuid.UUID
	for _, candidate := range scoredCandidates {
		reserved, err := s.reserveDriver(ctx, candidate.DriverID.String(), event.AggregateID.String())
		if err != nil {
			log.Printf("Error reserving driver %s: %v", candidate.DriverID, err)
			continue
		}
		if reserved {
			assignedDriverID = candidate.DriverID
			saga.SelectedDriver = &assignedDriverID
			saga.State = model.SagaStateCompleted
			saga.UpdatedAt = time.Now()
			now := time.Now()
			saga.CompletedAt = &now
			s.redisClient.SaveSaga(ctx, saga)
			break
		}
	}

	if assignedDriverID == uuid.Nil {
		return s.handleNoDriversAvailable(ctx, event)
	}

	// Save assignment
	if err := s.redisClient.SaveAssignment(ctx, event.AggregateID, assignedDriverID); err != nil {
		return err
	}

	// Mark event as processed
	if err := s.redisClient.MarkEventProcessed(ctx, event.EventID); err != nil {
		return err
	}

	// Get driver details
	driverName, driverPhone, vehicleType, licensePlate := s.getDriverDetails(ctx, assignedDriverID)

	// Publish DriverAssigned event
	assignedEvent := model.DriverAssignedEvent{
		EventID:     uuid.New(),
		EventType:   "DriverAssigned",
		Version:     1,
		OccurredAt:  time.Now(),
		AggregateID: event.AggregateID,
		Payload: model.DriverAssignedPayload{
			DeliveryID:    event.AggregateID,
			DriverID:      assignedDriverID,
			DriverName:    driverName,
			DriverPhone:   driverPhone,
			VehicleType:   vehicleType,
			LicensePlate:  licensePlate,
			AssignedAt:    time.Now(),
		},
	}

	return s.kafkaPublisher.Publish(ctx, event.AggregateID.String(), assignedEvent)
}

func (s *DispatchService) scoreDrivers(ctx context.Context, candidates []*model.Driver, pickupLat, pickupLon float64, packageWeight float64) []model.DriverCandidate {
	var scored []model.DriverCandidate

	for _, driver := range candidates {
		// Calculate distance
		distance := HaversineDistance(pickupLat, pickupLon, driver.CurrentLatitude, driver.CurrentLongitude)
		if distance > s.maxDistanceKm {
			continue // Skip drivers too far away
		}

		// Get driver details for capacity check
		resp, err := s.driverServiceClient.GetDriver(ctx, driver.Id)
		if err != nil {
			log.Printf("Failed to get driver details for %s: %v", driver.Id, err)
			continue
		}

		// Calculate current load
		activeDeliveries, _ := s.getActiveDeliveryCount(ctx, driver.Id)

		candidate := model.DriverCandidate{
			DriverID:    driver.Id,
			Name:        driver.Name,
			VehicleType: driver.VehicleType,
			LicensePlate: driver.LicensePlate,
			Latitude:    driver.CurrentLatitude,
			Longitude:   driver.CurrentLongitude,
			DistanceKm:  distance,
			Rating:      driver.Rating,
			CurrentLoad: activeDeliveries,
			MaxCapacity: s.getVehicleCapacity(driver.VehicleType),
			Status:      driver.Status,
		}

		// Calculate score (lower is better)
		// Factors: distance (weight: 0.5), rating (weight: 0.2), current load (weight: 0.3)
		distanceScore := distance / s.maxDistanceKm * 50.0           // 0-50
		ratingScore := (5.0 - driver.Rating) * 10.0                  // 0-20 (lower rating = higher score)
		loadScore := float64(candidate.CurrentLoad) / float64(candidate.MaxCapacity) * 30.0 // 0-30

		candidate.Score = distanceScore + ratingScore + loadScore
		scored = append(scored, candidate)
	}

	// Sort by score (lower is better)
	for i := 0; i < len(scored)-1; i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].Score < scored[i].Score {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}

	return scored
}

func (s *DispatchService) getVehicleCapacity(vehicleType string) int {
	switch vehicleType {
	case "BICYCLE":
		return 2
	case "MOTORCYCLE":
		return 3
	case "CAR":
		return 5
	case "VAN":
		return 10
	case "TRUCK":
		return 20
	default:
		return 5
	}
}

func (s *DispatchService) getActiveDeliveryCount(ctx context.Context, driverID uuid.UUID) (int, error) {
	// In a real implementation, this would query the order service
	// For now, return 0 as placeholder
	return 0, nil
}

func (s *DispatchService) findNearbyDrivers(ctx context.Context, lat, lon float64) ([]*model.Driver, error) {
	if s.driverServiceClient == nil {
		log.Printf("Driver service client not available, cannot find nearby drivers")
		return []*model.Driver{}, nil
	}

	drivers, err := s.driverServiceClient.FindNearbyDrivers(ctx, lat, lon, s.maxDistanceKm, 20)
	if err != nil {
		log.Printf("gRPC error finding nearby drivers: %v", err)
		return []*model.Driver{}, err
	}

	return drivers, nil
}

func (s *DispatchService) reserveDriver(ctx context.Context, driverID, deliveryID string) (bool, error) {
	if s.driverServiceClient == nil {
		log.Printf("Driver service client not available, cannot reserve driver %s", driverID)
		return false, nil
	}

	success, msg, err := s.driverServiceClient.ReserveDriver(ctx, driverID, deliveryID)
	if err != nil {
		log.Printf("gRPC error reserving driver %s: %v", driverID, err)
		return false, err
	}

	if !success {
		log.Printf("Failed to reserve driver %s: %s", driverID, msg)
	}

	return success, nil
}

func (s *DispatchService) getDriverDetails(ctx context.Context, driverID uuid.UUID) (name, phone, vehicleType, licensePlate string) {
	if s.driverServiceClient != nil {
		resp, err := s.driverServiceClient.GetDriver(ctx, driverID.String())
		if err == nil && resp != nil && resp.Driver != nil {
			return resp.Driver.Name, resp.Driver.Phone, resp.Driver.VehicleType, resp.Driver.LicensePlate
		}
		log.Printf("Failed to get driver details via gRPC for %s: %v", driverID, err)
	}
	// Fallback to mock data
	return "John Driver", "+1234567890", "MOTORCYCLE", "ABC-1234"
}

func (s *DispatchService) handleNoDriversAvailable(ctx context.Context, event model.DeliveryCreatedEvent) error {
	log.Printf("No drivers available for delivery %s", event.AggregateID)

	// Check retry count
	retryCount, err := s.redisClient.GetRetryCount(ctx, event.EventID)
	if err != nil {
		return err
	}

	if retryCount >= MaxRetries {
		// Max retries exceeded, send to DLQ
		dlqEvent := &model.DeadLetterEvent{
			OriginalEvent: []byte{}, // Would be populated with original event
			Error:         "Max retries exceeded: no drivers available",
			RetryCount:    retryCount,
			FailedAt:      time.Now(),
			OriginalTopic: "delivery.created",
		}
		s.redisClient.AddToDLQ(ctx, dlqEvent)

		// Update order service to mark delivery as unassignable
		s.updateDeliveryStatus(ctx, event.AggregateID, "UNASSIGNABLE")
		return nil
	}

	// Increment retry count
	newRetryCount, err := s.redisClient.IncrementRetryCount(ctx, event.EventID)
	if err != nil {
		return err
	}

	// Calculate exponential backoff
	delay := time.Duration(float64(BaseRetryDelay) * math.Pow(2, float64(newRetryCount-1)))
	if delay > MaxRetryDelay {
		delay = MaxRetryDelay
	}

	log.Printf("No drivers available for delivery %s, scheduling retry %d in %v", event.AggregateID, newRetryCount, delay)

	// Republish to retry topic with delay
	time.AfterFunc(delay, func() {
		// Republish the event
		s.kafkaPublisher.Publish(context.Background(), event.AggregateID.String(), map[string]interface{}{
			"eventId":     uuid.New(),
			"eventType":   "DeliveryCreated",
			"version":     1,
			"occurredAt":  time.Now(),
			"aggregateId": event.AggregateID,
			"payload": map[string]interface{}{
				"deliveryId":       event.Payload.DeliveryID,
				"customerId":       event.Payload.CustomerID,
				"pickupAddress":    event.Payload.PickupAddress,
				"pickupLatitude":   event.Payload.PickupLatitude,
				"pickupLongitude":  event.Payload.PickupLongitude,
				"dropoffAddress":   event.Payload.DropoffAddress,
				"dropoffLatitude":  event.Payload.DropoffLatitude,
				"dropoffLongitude": event.Payload.DropoffLongitude,
				"packageType":      event.Payload.PackageType,
				"packageWeight":    event.Payload.PackageWeight,
				"createdAt":        event.Payload.CreatedAt,
			},
		})
	})

	return nil
}

func (s *DispatchService) handleAssignmentFailure(ctx context.Context, saga *model.AssignmentSaga, err error) {
	saga.State = model.SagaStateFailed
	saga.ErrorMessage = err.Error()
	saga.UpdatedAt = time.Now()
	now := time.Now()
	saga.CompletedAt = &now
	s.redisClient.SaveSaga(ctx, saga)
	log.Printf("Assignment saga failed for delivery %s: %v", saga.DeliveryID, err)
}

func (s *DispatchService) updateDeliveryStatus(ctx context.Context, deliveryID uuid.UUID, status string) {
	// In a real implementation, this would call the order service API
	log.Printf("Would update delivery %s status to %s", deliveryID, status)
}

// HaversineDistance calculates distance between two points in kilometers
func HaversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // Earth radius in km

	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

func (s *DispatchService) Close() error {
	if s.driverServiceClient != nil {
		return s.driverServiceClient.Close()
	}
	return nil
}