package grpc

import (
	"context"

	"github.com/deliveryhub/driver-service/internal/model"
	"github.com/deliveryhub/driver-service/internal/service"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// DriverServiceServer implements the gRPC service for driver operations
type DriverServiceServer struct {
	UnimplementedDriverServiceServer
	service *service.DriverService
}

func NewDriverServiceServer(svc *service.DriverService) *DriverServiceServer {
	return &DriverServiceServer{service: svc}
}

func (s *DriverServiceServer) GetDriver(ctx context.Context, req *GetDriverRequest) (*GetDriverResponse, error) {
	id, err := uuid.Parse(req.DriverId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid driver ID")
	}

	driver, err := s.service.GetDriver(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "driver not found")
	}

	return &GetDriverResponse{
		Driver: &Driver{
			Id:             driver.ID.String(),
			Name:           driver.Name,
			Phone:          driver.Phone,
			Email:          driver.Email,
			VehicleType:    driver.VehicleType,
			LicensePlate:   driver.LicensePlate,
			Status:         driver.Status.String(),
			CurrentLatitude: 0,
			CurrentLongitude: 0,
			Rating:         driver.Rating,
			TotalDeliveries: int32(driver.TotalDeliveries),
		},
	}, nil
}

func (s *DriverServiceServer) GetDriverLocation(ctx context.Context, req *GetDriverLocationRequest) (*GetDriverLocationResponse, error) {
	lat, lon, found := s.service.GetDriverLocation(ctx, req.DriverId)
	if !found {
		return nil, status.Errorf(codes.NotFound, "location not found")
	}

	return &GetDriverLocationResponse{
		DriverId:   req.DriverId,
		Latitude:   lat,
		Longitude:  lon,
	}, nil
}

func (s *DriverServiceServer) UpdateDriverStatus(ctx context.Context, req *UpdateDriverStatusRequest) (*UpdateDriverStatusResponse, error) {
	id, err := uuid.Parse(req.DriverId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid driver ID")
	}

	newStatus := model.DriverStatus(req.Status)
	if !newStatus.IsValid() {
		return nil, status.Errorf(codes.InvalidArgument, "invalid status")
	}

	if err := s.service.UpdateStatus(ctx, id, newStatus); err != nil {
		return nil, status.Errorf(codes.FailedPrecondition, err.Error())
	}

	return &UpdateDriverStatusResponse{Success: true}, nil
}

func (s *DriverServiceServer) ReserveDriver(ctx context.Context, req *ReserveDriverRequest) (*ReserveDriverResponse, error) {
	success, err := s.service.ReserveDriver(ctx, req.DriverId, req.DeliveryId, 5*time.Minute)
	if err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}

	if !success {
		return &ReserveDriverResponse{Success: false, Message: "driver already reserved"}, nil
	}

	return &ReserveDriverResponse{Success: true}, nil
}

func (s *DriverServiceServer) ReleaseDriverReservation(ctx context.Context, req *ReleaseDriverReservationRequest) (*ReleaseDriverReservationResponse, error) {
	if err := s.service.ReleaseReservation(ctx, req.DriverId); err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}
	return &ReleaseDriverReservationResponse{Success: true}, nil
}

// Protobuf message types (defined inline for simplicity, would normally be in .proto file)
type GetDriverRequest struct {
	DriverId string `json:"driver_id"`
}

type GetDriverResponse struct {
	Driver *Driver `json:"driver"`
}

type GetDriverLocationRequest struct {
	DriverId string `json:"driver_id"`
}

type GetDriverLocationResponse struct {
	DriverId  string  `json:"driver_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type UpdateDriverStatusRequest struct {
	DriverId string `json:"driver_id"`
	Status   string `json:"status"`
}

type UpdateDriverStatusResponse struct {
	Success bool `json:"success"`
}

type ReserveDriverRequest struct {
	DriverId   string `json:"driver_id"`
	DeliveryId string `json:"delivery_id"`
}

type ReserveDriverResponse struct {
	Success  bool   `json:"success"`
	Message  string `json:"message"`
}

type ReleaseDriverReservationRequest struct {
	DriverId string `json:"driver_id"`
}

type ReleaseDriverReservationResponse struct {
	Success bool `json:"success"`
}

type Driver struct {
	Id              string  `json:"id"`
	Name            string  `json:"name"`
	Phone           string  `json:"phone"`
	Email           string  `json:"email"`
	VehicleType     string  `json:"vehicle_type"`
	LicensePlate    string  `json:"license_plate"`
	Status          string  `json:"status"`
	CurrentLatitude  float64 `json:"current_latitude"`
	CurrentLongitude float64 `json:"current_longitude"`
	Rating          float64 `json:"rating"`
	TotalDeliveries int32   `json:"total_deliveries"`
}

// UnimplementedDriverServiceServer must be embedded
type UnimplementedDriverServiceServer struct{}

func (UnimplementedDriverServiceServer) GetDriver(context.Context, *GetDriverRequest) (*GetDriverResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetDriver not implemented")
}
func (UnimplementedDriverServiceServer) GetDriverLocation(context.Context, *GetDriverLocationRequest) (*GetDriverLocationResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetDriverLocation not implemented")
}
func (UnimplementedDriverServiceServer) UpdateDriverStatus(context.Context, *UpdateDriverStatusRequest) (*UpdateDriverStatusResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateDriverStatus not implemented")
}
func (UnimplementedDriverServiceServer) ReserveDriver(context.Context, *ReserveDriverRequest) (*ReserveDriverResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ReserveDriver not implemented")
}
func (UnimplementedDriverServiceServer) ReleaseDriverReservation(context.Context, *ReleaseDriverReservationRequest) (*ReleaseDriverReservationResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ReleaseDriverReservation not implemented")
}