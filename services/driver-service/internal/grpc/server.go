package grpc

import (
	"context"
	"time"

	"github.com/deliveryhub/driver-service/internal/model"
	"github.com/deliveryhub/driver-service/internal/service"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	drivergrpc "github.com/deliveryhub/driver-service/internal/grpc"
)

// DriverServiceServer implements the gRPC service for driver operations
type DriverServiceServer struct {
	drivergrpc.UnimplementedDriverServiceServer
	service *service.DriverService
}

func NewDriverServiceServer(svc *service.DriverService) *DriverServiceServer {
	return &DriverServiceServer{service: svc}
}

func (s *DriverServiceServer) GetDriver(ctx context.Context, req *drivergrpc.GetDriverRequest) (*drivergrpc.GetDriverResponse, error) {
	id, err := uuid.Parse(req.DriverId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid driver ID")
	}

	driver, err := s.service.GetDriver(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "driver not found")
	}

	return &drivergrpc.GetDriverResponse{
		Driver: &drivergrpc.Driver{
			Id:              driver.ID.String(),
			Name:            driver.Name,
			Phone:           driver.Phone,
			Email:           driver.Email,
			VehicleType:     driver.VehicleType,
			LicensePlate:    driver.LicensePlate,
			Status:          driver.Status.String(),
			CurrentLatitude:  0,
			CurrentLongitude: 0,
			Rating:          driver.Rating,
			TotalDeliveries: int32(driver.TotalDeliveries),
		},
	}, nil
}

func (s *DriverServiceServer) GetDriverLocation(ctx context.Context, req *drivergrpc.GetDriverLocationRequest) (*drivergrpc.GetDriverLocationResponse, error) {
	lat, lon, found := s.service.GetDriverLocation(ctx, req.DriverId)
	if !found {
		return nil, status.Errorf(codes.NotFound, "location not found")
	}

	return &drivergrpc.GetDriverLocationResponse{
		DriverId:  req.DriverId,
		Latitude:  lat,
		Longitude: lon,
	}, nil
}

func (s *DriverServiceServer) UpdateDriverStatus(ctx context.Context, req *drivergrpc.UpdateDriverStatusRequest) (*drivergrpc.UpdateDriverStatusResponse, error) {
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

	return &drivergrpc.UpdateDriverStatusResponse{Success: true}, nil
}

func (s *DriverServiceServer) ReserveDriver(ctx context.Context, req *drivergrpc.ReserveDriverRequest) (*drivergrpc.ReserveDriverResponse, error) {
	success, err := s.service.ReserveDriver(ctx, req.DriverId, req.DeliveryId, 5*time.Minute)
	if err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}

	if !success {
		return &drivergrpc.ReserveDriverResponse{Success: false, Message: "driver already reserved"}, nil
	}

	return &drivergrpc.ReserveDriverResponse{Success: true}, nil
}

func (s *DriverServiceServer) ReleaseDriverReservation(ctx context.Context, req *drivergrpc.ReleaseDriverReservationRequest) (*drivergrpc.ReleaseDriverReservationResponse, error) {
	if err := s.service.ReleaseReservation(ctx, req.DriverId); err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}
	return &drivergrpc.ReleaseDriverReservationResponse{Success: true}, nil
}

func (s *DriverServiceServer) FindNearbyDrivers(ctx context.Context, req *drivergrpc.FindNearbyDriversRequest) (*drivergrpc.FindNearbyDriversResponse, error) {
	if req.RadiusKm <= 0 {
		req.RadiusKm = 10.0 // Default 10km
	}
	if req.Limit <= 0 {
		req.Limit = 20 // Default 20 drivers
	}

	driverIDs, err := s.service.FindNearbyAvailableDrivers(ctx, req.Latitude, req.Longitude, req.RadiusKm)
	if err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}

	if len(driverIDs) > int(req.Limit) {
		driverIDs = driverIDs[:req.Limit]
	}

	var drivers []*drivergrpc.Driver
	for _, driverID := range driverIDs {
		driver, err := s.service.GetDriver(ctx, uuid.MustParse(driverID))
		if err != nil {
			continue // Skip drivers that can't be loaded
		}

		lat, lon, _ := s.service.GetDriverLocation(ctx, driverID)

		drivers = append(drivers, &drivergrpc.Driver{
			Id:              driver.ID.String(),
			Name:            driver.Name,
			Phone:           driver.Phone,
			Email:           driver.Email,
			VehicleType:     driver.VehicleType,
			LicensePlate:    driver.LicensePlate,
			Status:          driver.Status.String(),
			CurrentLatitude:  lat,
			CurrentLongitude: lon,
			Rating:          driver.Rating,
			TotalDeliveries: int32(driver.TotalDeliveries),
		})
	}

	return &drivergrpc.FindNearbyDriversResponse{Drivers: drivers}, nil
}