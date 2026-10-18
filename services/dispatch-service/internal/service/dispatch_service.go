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

	// Acquire lock for this delivery
	locked, err := s.redisClient.AcquireDispatchLock(ctx, event.AggregateID)
	if err != nil {
		return err
	}
	if !locked {
		log.Printf("Could not acquire lock for delivery %s, will retry", event.AggregateID)
		return fmt.Errorf("could not acquire lock")
	}
	defer s.redisClient.ReleaseDispatchLock(ctx, event.AggregateID)

	// Find nearby drivers
	driverIDs, err := s.findNearbyDrivers(ctx, event.Payload.PickupLatitude, event.Payload.PickupLongitude)
	if err != nil {
		return err
	}

	if len(driverIDs) == 0 {
		log.Printf("No available drivers found for delivery %s", event.AggregateID)
		// In production: schedule retry or mark as unassigned
		return s.handleNoDriversAvailable(ctx, event)
	}

	// Try to reserve a driver (try each in order until one succeeds)
	var assignedDriverID uuid.UUID
	for _, driverID := range driverIDs {
		reserved, err := s.reserveDriver(ctx, driverID, event.AggregateID.String())
		if err != nil {
			log.Printf("Error reserving driver %s: %v", driverID, err)
			continue
		}
		if reserved {
			assignedDriverID = uuid.MustParse(driverID)
			break
		}
	}

	if assignedDriverID == uuid.Nil {
		log.Printf("Failed to reserve any driver for delivery %s", event.AggregateID)
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

	// Get driver details (in production, call driver service gRPC)
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

func (s *DispatchService) findNearbyDrivers(ctx context.Context, lat, lon float64) ([]string, error) {
	// Use gRPC to find nearby available drivers
	if s.driverServiceClient == nil {
		log.Printf("Driver service client not available, cannot find nearby drivers")
		return []string{}, nil
	}

	drivers, err := s.driverServiceClient.FindNearbyDrivers(ctx, lat, lon, s.maxDistanceKm, 20)
	if err != nil {
		log.Printf("gRPC error finding nearby drivers: %v", err)
		return []string{}, err
	}

	var driverIDs []string
	for _, driver := range drivers {
		driverIDs = append(driverIDs, driver.Id)
	}

	return driverIDs, nil
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
	// In production: 
	// 1. Schedule retry with exponential backoff
	// 2. Publish to retry topic
	// 3. Eventually mark delivery as unassignable
	log.Printf("No drivers available for delivery %s", event.AggregateID)
	return nil
}

func (s *DispatchService) Close() error {
	if s.driverServiceClient != nil {
		return s.driverServiceClient.Close()
	}
	return nil
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