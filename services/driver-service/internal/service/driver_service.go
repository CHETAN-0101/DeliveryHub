package service

import (
	"context"
	"fmt"
	"time"

	"github.com/deliveryhub/driver-service/internal/model"
	"github.com/deliveryhub/driver-service/internal/repository"
	"github.com/deliveryhub/driver-service/pkg/redis"
	"github.com/google/uuid"
)

type DriverService struct {
	repo      *repository.DriverRepository
	geoRepo   *redis.GeoRepository
}

func NewDriverService(repo *repository.DriverRepository, geoRepo *redis.GeoRepository) *DriverService {
	return &DriverService{
		repo:    repo,
		geoRepo: geoRepo,
	}
}

func (s *DriverService) CreateDriver(ctx context.Context, name, phone, email, vehicleType, licensePlate string) (*model.Driver, error) {
	// Check if phone already exists
	existing, err := s.repo.GetByPhone(ctx, phone)
	if err == nil && existing != nil {
		return nil, fmt.Errorf("driver with phone %s already exists", phone)
	}

	driver := &model.Driver{
		ID:              uuid.New(),
		Name:            name,
		Phone:           phone,
		Email:           email,
		VehicleType:     vehicleType,
		LicensePlate:    licensePlate,
		Status:          model.DriverStatusOffline,
		Rating:          5.0,
		TotalDeliveries: 0,
	}

	if err := s.repo.Create(ctx, driver); err != nil {
		return nil, fmt.Errorf("failed to create driver: %w", err)
	}

	// Set initial status in Redis
	if err := s.geoRepo.SetDriverStatus(ctx, driver.ID.String(), model.DriverStatusOffline.String()); err != nil {
		return nil, fmt.Errorf("failed to set driver status in Redis: %w", err)
	}

	return driver, nil
}

func (s *DriverService) GetDriver(ctx context.Context, id uuid.UUID) (*model.Driver, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *DriverService) UpdateStatus(ctx context.Context, id uuid.UUID, newStatus model.DriverStatus) error {
	driver, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if !driver.Status.CanTransitionTo(newStatus) {
		return fmt.Errorf("invalid status transition from %s to %s", driver.Status, newStatus)
	}

	if err := s.repo.UpdateStatus(ctx, id, driver.Status, newStatus); err != nil {
		return err
	}

	// Update Redis cache
	return s.geoRepo.SetDriverStatus(ctx, id.String(), newStatus.String())
}

func (s *DriverService) UpdateLocation(ctx context.Context, id uuid.UUID, lat, lon float64, accuracy, heading, speed *float64) error {
	if _, err := s.repo.GetByID(ctx, id); err != nil {
		return err
	}

	// Update PostgreSQL
	if err := s.repo.UpdateLocation(ctx, id, lat, lon); err != nil {
		return err
	}

	// Update Redis geo index
	if err := s.geoRepo.AddDriverLocation(ctx, id.String(), lat, lon); err != nil {
		return err
	}

	// Update Redis cache
	if err := s.geoRepo.UpdateDriverLocationCache(ctx, id.String(), lat, lon); err != nil {
		return err
	}

	// Save to history
	location := &model.DriverLocation{
		ID:        uuid.New(),
		DriverID:  id,
		Latitude:  lat,
		Longitude: lon,
		Accuracy:  accuracy,
		Heading:   heading,
		Speed:     speed,
		RecordedAt: time.Now(),
	}
	return s.repo.SaveLocation(ctx, location)
}

func (s *DriverService) ListDrivers(ctx context.Context, limit, offset int) ([]*model.Driver, error) {
	return s.repo.List(ctx, limit, offset)
}

func (s *DriverService) FindNearbyAvailableDrivers(ctx context.Context, lat, lon float64, radiusKm float64) ([]string, error) {
	return s.geoRepo.FindNearbyDrivers(ctx, lat, lon, radiusKm)
}

func (s *DriverService) ReserveDriver(ctx context.Context, driverID, deliveryID string, ttl time.Duration) (bool, error) {
	return s.geoRepo.ReserveDriver(ctx, driverID, deliveryID, ttl)
}

func (s *DriverService) ReleaseReservation(ctx context.Context, driverID string) error {
	return s.geoRepo.ReleaseDriverReservation(ctx, driverID)
}

func (s *DriverService) GetDriverStatus(ctx context.Context, driverID string) (string, error) {
	return s.geoRepo.GetDriverStatus(ctx, driverID)
}

func (s *DriverService) GetDriverLocation(ctx context.Context, driverID string) (lat, lon float64, found bool) {
	return s.geoRepo.GetDriverLocationCache(ctx, driverID)
}