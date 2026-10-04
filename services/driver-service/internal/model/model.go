package model

import (
	"time"

	"github.com/google/uuid"
)

type DriverStatus string

const (
	DriverStatusOffline  DriverStatus = "OFFLINE"
	DriverStatusAvailable DriverStatus = "AVAILABLE"
	DriverStatusReserved  DriverStatus = "RESERVED"
	DriverStatusBusy      DriverStatus = "BUSY"
)

func (s DriverStatus) String() string {
	return string(s)
}

func (s DriverStatus) IsValid() bool {
	switch s {
	case DriverStatusOffline, DriverStatusAvailable, DriverStatusReserved, DriverStatusBusy:
		return true
	}
	return false
}

func (s DriverStatus) CanTransitionTo(newStatus DriverStatus) bool {
	switch s {
	case DriverStatusOffline:
		return newStatus == DriverStatusAvailable
	case DriverStatusAvailable:
		return newStatus == DriverStatusReserved || newStatus == DriverStatusOffline || newStatus == DriverStatusBusy
	case DriverStatusReserved:
		return newStatus == DriverStatusBusy || newStatus == DriverStatusAvailable
	case DriverStatusBusy:
		return newStatus == DriverStatusAvailable || newStatus == DriverStatusOffline
	}
	return false
}

type Driver struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	Name              string     `json:"name" db:"name"`
	Phone             string     `json:"phone" db:"phone"`
	Email             string     `json:"email" db:"email"`
	VehicleType       string     `json:"vehicleType" db:"vehicle_type"`
	LicensePlate      string     `json:"licensePlate" db:"license_plate"`
	Status            DriverStatus `json:"status" db:"status"`
	CurrentLatitude   *float64   `json:"currentLatitude,omitempty" db:"current_latitude"`
	CurrentLongitude  *float64   `json:"currentLongitude,omitempty" db:"current_longitude"`
	LastLocationUpdate *time.Time `json:"lastLocationUpdate,omitempty" db:"last_location_update"`
	Rating            float64    `json:"rating" db:"rating"`
	TotalDeliveries   int        `json:"totalDeliveries" db:"total_deliveries"`
	CreatedAt         time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt         time.Time  `json:"updatedAt" db:"updated_at"`
}

type DriverLocation struct {
	ID        uuid.UUID `json:"id" db:"id"`
	DriverID  uuid.UUID `json:"driverId" db:"driver_id"`
	Latitude  float64   `json:"latitude" db:"latitude"`
	Longitude float64   `json:"longitude" db:"longitude"`
	Accuracy  *float64  `json:"accuracy,omitempty" db:"accuracy"`
	Heading   *float64  `json:"heading,omitempty" db:"heading"`
	Speed     *float64  `json:"speed,omitempty" db:"speed"`
	RecordedAt time.Time `json:"recordedAt" db:"recorded_at"`
}

type DriverStatusHistory struct {
	ID        uuid.UUID `json:"id" db:"id"`
	DriverID  uuid.UUID `json:"driverId" db:"driver_id"`
	OldStatus *DriverStatus `json:"oldStatus,omitempty" db:"old_status"`
	NewStatus DriverStatus `json:"newStatus" db:"new_status"`
	ChangedAt time.Time  `json:"changedAt" db:"changed_at"`
}