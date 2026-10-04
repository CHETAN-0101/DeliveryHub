package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/deliveryhub/driver-service/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DriverRepository struct {
	db *pgxpool.Pool
}

func NewDriverRepository(db *pgxpool.Pool) *DriverRepository {
	return &DriverRepository{db: db}
}

func (r *DriverRepository) Create(ctx context.Context, driver *model.Driver) error {
	query := `
		INSERT INTO drivers (id, name, phone, email, vehicle_type, license_plate, status, rating, total_deliveries, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
	`
	_, err := r.db.Exec(ctx, query,
		driver.ID, driver.Name, driver.Phone, driver.Email,
		driver.VehicleType, driver.LicensePlate, driver.Status,
		driver.Rating, driver.TotalDeliveries)
	return err
}

func (r *DriverRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Driver, error) {
	query := `SELECT id, name, phone, email, vehicle_type, license_plate, status, current_latitude, current_longitude, last_location_update, rating, total_deliveries, created_at, updated_at FROM drivers WHERE id = $1`
	
	driver := &model.Driver{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&driver.ID, &driver.Name, &driver.Phone, &driver.Email,
		&driver.VehicleType, &driver.LicensePlate, &driver.Status,
		&driver.CurrentLatitude, &driver.CurrentLongitude, &driver.LastLocationUpdate,
		&driver.Rating, &driver.TotalDeliveries, &driver.CreatedAt, &driver.UpdatedAt)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("driver not found: %w", err)
	}
	return driver, err
}

func (r *DriverRepository) GetByPhone(ctx context.Context, phone string) (*model.Driver, error) {
	query := `SELECT id, name, phone, email, vehicle_type, license_plate, status, current_latitude, current_longitude, last_location_update, rating, total_deliveries, created_at, updated_at FROM drivers WHERE phone = $1`
	
	driver := &model.Driver{}
	err := r.db.QueryRow(ctx, query, phone).Scan(
		&driver.ID, &driver.Name, &driver.Phone, &driver.Email,
		&driver.VehicleType, &driver.LicensePlate, &driver.Status,
		&driver.CurrentLatitude, &driver.CurrentLongitude, &driver.LastLocationUpdate,
		&driver.Rating, &driver.TotalDeliveries, &driver.CreatedAt, &driver.UpdatedAt)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("driver not found: %w", err)
	}
	return driver, err
}

func (r *DriverRepository) UpdateStatus(ctx context.Context, id uuid.UUID, oldStatus, newStatus model.DriverStatus) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update driver status
	query := `UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3`
	result, err := tx.Exec(ctx, query, newStatus, id, oldStatus)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("driver not found or status mismatch")
	}

	// Record status history
	historyQuery := `INSERT INTO driver_status_history (id, driver_id, old_status, new_status, changed_at) VALUES ($1, $2, $3, $4, NOW())`
	_, err = tx.Exec(ctx, historyQuery, uuid.New(), id, oldStatus, newStatus)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *DriverRepository) UpdateLocation(ctx context.Context, id uuid.UUID, lat, lon float64) error {
	query := `UPDATE drivers SET current_latitude = $1, current_longitude = $2, last_location_update = NOW(), updated_at = NOW() WHERE id = $3`
	_, err := r.db.Exec(ctx, query, lat, lon, id)
	return err
}

func (r *DriverRepository) List(ctx context.Context, limit, offset int) ([]*model.Driver, error) {
	query := `SELECT id, name, phone, email, vehicle_type, license_plate, status, current_latitude, current_longitude, last_location_update, rating, total_deliveries, created_at, updated_at FROM drivers ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	
	rows, err := r.db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var drivers []*model.Driver
	for rows.Next() {
		driver := &model.Driver{}
		err := rows.Scan(
			&driver.ID, &driver.Name, &driver.Phone, &driver.Email,
			&driver.VehicleType, &driver.LicensePlate, &driver.Status,
			&driver.CurrentLatitude, &driver.CurrentLongitude, &driver.LastLocationUpdate,
			&driver.Rating, &driver.TotalDeliveries, &driver.CreatedAt, &driver.UpdatedAt)
		if err != nil {
			return nil, err
		}
		drivers = append(drivers, driver)
	}
	return drivers, rows.Err()
}

func (r *DriverRepository) SaveLocation(ctx context.Context, location *model.DriverLocation) error {
	query := `INSERT INTO driver_locations (id, driver_id, latitude, longitude, accuracy, heading, speed, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := r.db.Exec(ctx, query,
		location.ID, location.DriverID, location.Latitude, location.Longitude,
		location.Accuracy, location.Heading, location.Speed, location.RecordedAt)
	return err
}