package main

// @title DeliveryHub Driver Service
// @version 1.0.0
// @description Driver management service for DeliveryHub
// @host localhost:8082
// @BasePath /api/v1
// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization
// @description JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deliveryhub/driver-service/internal/config"
	"github.com/deliveryhub/driver-service/internal/grpc"
	"github.com/deliveryhub/driver-service/internal/handler"
	"github.com/deliveryhub/driver-service/internal/repository"
	"github.com/deliveryhub/driver-service/internal/service"
	"github.com/deliveryhub/driver-service/pkg/kafka"
	pkgredis "github.com/deliveryhub/driver-service/pkg/redis"
	"github.com/deliveryhub/go-common/eureka"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/go-redis/redis/v8"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	_ "github.com/deliveryhub/driver-service/internal/config"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"google.golang.org/grpc"
	drivergrpc "github.com/deliveryhub/driver-service/internal/grpc"
)

func main() {
	cfg := config.Load()

	// Initialize OpenTelemetry
	tp, err := initTracer(cfg)
	if err != nil {
		log.Printf("Warning: failed to initialize tracer: %v", err)
	}
	defer func() {
		if tp != nil {
			tp.Shutdown(context.Background())
		}
	}()

	// Initialize Eureka client for service discovery
	var eurekaClient *eureka.Client
	ctx := context.Background()
	
	if cfg.EurekaEnabled {
		eurekaConfig := eureka.DefaultClientConfig(cfg.AppName)
		eurekaConfig.EurekaURLs = cfg.EurekaURLs
		eurekaConfig.Username = cfg.EurekaUsername
		eurekaConfig.Password = cfg.EurekaPassword
		eurekaConfig.InstanceID = cfg.InstanceID
		eurekaConfig.HostName = cfg.HostName
		eurekaConfig.Port = cfg.PortInt
		eurekaConfig.SecurePort = cfg.GRPCPortInt
		eurekaConfig.HealthCheckURL = fmt.Sprintf("http://%s:%d/health", cfg.HostName, cfg.PortInt)
		eurekaConfig.HomePageURL = fmt.Sprintf("http://%s:%d", cfg.HostName, cfg.PortInt)
		eurekaConfig.StatusPageURL = fmt.Sprintf("http://%s:%d/actuator/info", cfg.HostName, cfg.PortInt)
		eurekaConfig.VIPAddress = cfg.AppName
		eurekaConfig.SecureVIPAddress = cfg.AppName
		eurekaConfig.Metadata = map[string]string{
			"zone":         "default",
			"version":      "1.0.0",
			"grpc-port":    cfg.GRPCPort,
			"secure-port":  fmt.Sprintf("%d", cfg.GRPCPortInt),
		}

		eurekaClient = eureka.NewClient(eurekaConfig)
		
		// Register with Eureka
		if err := eurekaClient.Register(ctx); err != nil {
			log.Printf("Warning: failed to register with Eureka: %v", err)
		} else {
			log.Println("Registered with Eureka")
		}

		// Start heartbeat and registry fetch
		eurekaClient.StartHeartbeat(ctx)
		eurekaClient.StartRegistryFetch(ctx)
		defer eurekaClient.Stop()
	}

	// Initialize PostgreSQL
	db, err := initPostgres(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer db.Close()

	// Initialize Redis
	redisClient := initRedis(cfg)
	defer redisClient.Close()

	// Initialize repositories
	driverRepo := repository.NewDriverRepository(db)
	geoRepo := pkgredis.NewGeoRepository(redisClient)

	// Initialize services
	driverService := service.NewDriverService(driverRepo, geoRepo)

	// Initialize Kafka publisher for location events
	locationPublisher := kafka.NewPublisher(cfg.KafkaBrokers, "driver.location.updated")
	defer locationPublisher.Close()

	// Initialize Kafka consumer for dispatch events
	dispatchConsumer := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaConsumerGroup, []string{"delivery.created", "delivery.cancelled"})
	defer dispatchConsumer.Close()

	// Start Kafka consumer in background
	go consumeDispatchEvents(dispatchConsumer, driverService, locationPublisher)

	// Initialize Gin router
	router := gin.Default()
	router.Use(otelgin.Middleware("driver-service"))

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "driver-service"})
	})

	// Metrics endpoint
	router.GET("/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "metrics endpoint - integrate with prometheus client"})
	})

	// Swagger UI
	router.GET("/api/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// API routes
	driverHandler := handler.NewDriverHandler(driverService)
	v1 := router.Group("/api/v1")
	{
		v1.POST("/drivers", driverHandler.CreateDriver)
		v1.GET("/drivers", driverHandler.ListDrivers)
		v1.GET("/drivers/:id", driverHandler.GetDriver)
		v1.PATCH("/drivers/:id/status", driverHandler.UpdateDriverStatus)
		v1.POST("/drivers/:id/location", driverHandler.UpdateDriverLocation)
		v1.GET("/drivers/:id/location", driverHandler.GetDriverLocation)
	}

	// Start HTTP server
	httpServer := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Starting HTTP server on port %s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Start gRPC server
	grpcListener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on gRPC port: %v", err)
	}

	grpcServer := grpc.NewServer()
	// Register gRPC services
	drivergrpc.RegisterDriverServiceServer(grpcServer, grpc.NewDriverServiceServer(driverService))

	go func() {
		log.Printf("Starting gRPC server on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(grpcListener); err != nil {
			log.Fatalf("gRPC server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Deregister from Eureka
	if eurekaClient != nil {
		eurekaClient.Deregister(ctx)
	}

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	grpcServer.GracefulStop()

	log.Println("Servers stopped")
}

func initTracer(cfg *config.Config) (*sdktrace.TracerProvider, error) {
	ctx := context.Background()
	
	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(cfg.OTELexporter),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String("driver-service"),
			semconv.ServiceVersionKey.String("1.0.0"),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	return tp, nil
}

func initPostgres(cfg *config.Config) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName)

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	poolConfig.MaxConns = 20
	poolConfig.MinConns = 5
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, err
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}

	log.Println("Connected to PostgreSQL")
	return pool, nil
}

func initRedis(cfg *config.Config) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisHost + ":" + cfg.RedisPort,
		Password: cfg.RedisPassword,
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
	} else {
		log.Println("Connected to Redis")
	}

	return client
}

func consumeDispatchEvents(consumer *kafka.Consumer, driverService *service.DriverService, publisher *kafka.Publisher) {
	ctx := context.Background()
	for {
		msg, err := consumer.ReadMessage(ctx)
		if err != nil {
			log.Printf("Kafka consumer error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		switch msg.Topic {
		case "delivery.created":
			handleDeliveryCreated(ctx, msg, driverService)
		case "delivery.cancelled":
			handleDeliveryCancelled(ctx, msg, driverService)
		default:
			log.Printf("Received message from unknown topic %s: %s", msg.Topic, string(msg.Value))
		}
	}
}

func handleDeliveryCreated(ctx context.Context, msg kafka.Message, driverService *service.DriverService) {
	// Parse delivery created event
	var event struct {
		AggregateID string `json:"aggregateId"`
		Payload     struct {
			PickupLatitude  float64 `json:"pickupLatitude"`
			PickupLongitude float64 `json:"pickupLongitude"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		log.Printf("Failed to unmarshal delivery.created: %v", err)
		return
	}

	log.Printf("Delivery created: %s at (%f, %f)", event.AggregateID, event.Payload.PickupLatitude, event.Payload.PickupLongitude)
	// In a full implementation, this would:
	// 1. Find nearby available drivers using Redis GEOSEARCH
	// 2. Notify drivers via push notification
	// 3. Update driver status to RESERVED when assigned
}

func handleDeliveryCancelled(ctx context.Context, msg kafka.Message, driverService *service.DriverService) {
	// Parse delivery cancelled event
	var event struct {
		AggregateID string `json:"aggregateId"`
	}
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		log.Printf("Failed to unmarshal delivery.cancelled: %v", err)
		return
	}

	log.Printf("Delivery cancelled: %s", event.AggregateID)
	// In a full implementation, this would:
	// 1. Release any driver reservations for this delivery
	// 2. Update driver status back to AVAILABLE
}