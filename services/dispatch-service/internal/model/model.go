package model

import (
	"time"

	"github.com/google/uuid"
)

type DeliveryCreatedEvent struct {
	EventID       uuid.UUID `json:"eventId"`
	EventType     string    `json:"eventType"`
	Version       int       `json:"version"`
	OccurredAt    time.Time `json:"occurredAt"`
	AggregateID   uuid.UUID `json:"aggregateId"`
	Payload       DeliveryCreatedPayload `json:"payload"`
}

type DeliveryCreatedPayload struct {
	DeliveryID       uuid.UUID `json:"deliveryId"`
	CustomerID       uuid.UUID `json:"customerId"`
	PickupAddress    string    `json:"pickupAddress"`
	PickupLatitude   float64   `json:"pickupLatitude"`
	PickupLongitude  float64   `json:"pickupLongitude"`
	DropoffAddress   string    `json:"dropoffAddress"`
	DropoffLatitude  float64   `json:"dropoffLatitude"`
	DropoffLongitude float64   `json:"dropoffLongitude"`
	PackageType      string    `json:"packageType"`
	PackageWeight    float64   `json:"packageWeight"`
	CreatedAt        time.Time `json:"createdAt"`
}

type DriverAssignedEvent struct {
	EventID     uuid.UUID `json:"eventId"`
	EventType   string    `json:"eventType"`
	Version     int       `json:"version"`
	OccurredAt  time.Time `json:"occurredAt"`
	AggregateID uuid.UUID `json:"aggregateId"`
	Payload     DriverAssignedPayload `json:"payload"`
}

type DriverAssignedPayload struct {
	DeliveryID    uuid.UUID `json:"deliveryId"`
	DriverID      uuid.UUID `json:"driverId"`
	DriverName    string    `json:"driverName"`
	DriverPhone   string    `json:"driverPhone"`
	VehicleType   string    `json:"vehicleType"`
	LicensePlate  string    `json:"licensePlate"`
	AssignedAt    time.Time `json:"assignedAt"`
}

type DriverLocationUpdatedEvent struct {
	EventID     uuid.UUID `json:"eventId"`
	EventType   string    `json:"eventType"`
	Version     int       `json:"version"`
	OccurredAt  time.Time `json:"occurredAt"`
	AggregateID uuid.UUID `json:"aggregateId"`
	Payload     DriverLocationPayload `json:"payload"`
}

type DriverLocationPayload struct {
	DriverID   uuid.UUID `json:"driverId"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type DispatchAssignment struct {
	DeliveryID  uuid.UUID
	DriverID    uuid.UUID
	AssignedAt  time.Time
	Status      string // PENDING, CONFIRMED, FAILED
}

// DriverCandidate represents a driver candidate for assignment with scoring
type DriverCandidate struct {
	DriverID       uuid.UUID
	Name           string
	VehicleType    string
	LicensePlate   string
	Latitude       float64
	Longitude      float64
	DistanceKm     float64
	Rating         float64
	CurrentLoad    int
	MaxCapacity    int
	Status         string
	Score          float64
}

// AssignmentSaga represents the assignment saga state
type AssignmentSaga struct {
	SagaID        uuid.UUID
	DeliveryID    uuid.UUID
	State         SagaState
	CurrentStep   int
	SelectedDriver *uuid.UUID
	RetryCount    int
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CompletedAt   *time.Time
	ErrorMessage  string
}

type SagaState string

const (
	SagaStateStarted     SagaState = "STARTED"
	SagaStateFinding     SagaState = "FINDING_DRIVERS"
	SagaStateReserving   SagaState = "RESERVING_DRIVER"
	SagaStateConfirming  SagaState = "CONFIRMING_ASSIGNMENT"
	SagaStateCompleted   SagaState = "COMPLETED"
	SagaStateFailed      SagaState = "FAILED"
	SagaStateCompensating SagaState = "COMPENSATING"
)

// DeadLetterEvent represents a failed event for DLQ
type DeadLetterEvent struct {
	OriginalEvent []byte
	Error         string
	RetryCount    int
	FailedAt      time.Time
	OriginalTopic string
}