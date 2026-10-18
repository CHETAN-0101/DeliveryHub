package grpc

import (
	"context"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	drivergrpc "github.com/deliveryhub/driver-service/internal/grpc"
)

type DriverServiceClient struct {
	client drivergrpc.DriverServiceClient
	conn   *grpc.ClientConn
}

func NewDriverServiceClient(addr string) (*DriverServiceClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, err
	}

	client := drivergrpc.NewDriverServiceClient(conn)
	return &DriverServiceClient{client: client, conn: conn}, nil
}

func (c *DriverServiceClient) Close() error {
	return c.conn.Close()
}

func (c *DriverServiceClient) ReserveDriver(ctx context.Context, driverID, deliveryID string) (bool, string, error) {
	resp, err := c.client.ReserveDriver(ctx, &drivergrpc.ReserveDriverRequest{
		DriverId:   driverID,
		DeliveryId: deliveryID,
	})
	if err != nil {
		return false, "", err
	}
	return resp.Success, resp.Message, nil
}

func (c *DriverServiceClient) ReleaseDriverReservation(ctx context.Context, driverID string) error {
	_, err := c.client.ReleaseDriverReservation(ctx, &drivergrpc.ReleaseDriverReservationRequest{
		DriverId: driverID,
	})
	return err
}

func (c *DriverServiceClient) GetDriver(ctx context.Context, driverID string) (*drivergrpc.GetDriverResponse, error) {
	return c.client.GetDriver(ctx, &drivergrpc.GetDriverRequest{
		DriverId: driverID,
	})
}

func (c *DriverServiceClient) GetDriverLocation(ctx context.Context, driverID string) (*drivergrpc.GetDriverLocationResponse, error) {
	return c.client.GetDriverLocation(ctx, &drivergrpc.GetDriverLocationRequest{
		DriverId: driverID,
	})
}

func (c *DriverServiceClient) UpdateDriverStatus(ctx context.Context, driverID, status string) error {
	_, err := c.client.UpdateDriverStatus(ctx, &drivergrpc.UpdateDriverStatusRequest{
		DriverId: driverID,
		Status:   status,
	})
	return err
}

func (c *DriverServiceClient) FindNearbyDrivers(ctx context.Context, lat, lon, radiusKm float64, limit int32) ([]*drivergrpc.Driver, error) {
	resp, err := c.client.FindNearbyDrivers(ctx, &drivergrpc.FindNearbyDriversRequest{
		Latitude:  lat,
		Longitude: lon,
		RadiusKm:  radiusKm,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}
	return resp.Drivers, nil
}