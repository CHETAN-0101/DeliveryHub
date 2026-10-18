package main

// @title DeliveryHub Dispatch Service
// @version 1.0.0
// @description Dispatch and driver assignment service for DeliveryHub
// @host localhost:8083
// @BasePath /api/v1
// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization
// @description JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deliveryhub/dispatch-service/internal/config"
	"github.com/deliveryhub/dispatch-service/internal/service"
	"github.com/deliveryhub/dispatch-service/pkg/kafka"
	pkgredis "github.com/deliveryhub/dispatch-service/pkg/redis"
	"github.com/deliveryhub/go-common/eureka"
	"github.com/gin-gonic/gin"
	goredis "github.com/go-redis/redis/v8"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	_ "github.com/deliveryhub/dispatch-service/internal/config"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"google.golang.org/grpc"
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

	// Initialize Redis
	redisClient := initRedis(cfg)
	defer redisClient.Close()

	// Initialize Kafka
	dispatchRedisClient := pkgredis.NewDispatchRedisClient(redisClient)
	
	// If Eureka is enabled, use service discovery for driver service gRPC
	driverServiceGRPCAddr := cfg.DriverServiceGRPCAddr
	if cfg.EurekaEnabled && eurekaClient != nil {
		// Try to discover driver-service
		instances := eurekaClient.GetInstances("driver-service")
		if len(instances) > 0 {
			// Use gRPC port from metadata or default
			grpcPort := instances[0].Metadata["grpc-port"]
			if grpcPort == "" {
				grpcPort = "9092"
			}
			driverServiceGRPCAddr = fmt.Sprintf("%s:%s", instances[0].IPAddr, grpcPort)
			log.Printf("Discovered driver-service gRPC at: %s", driverServiceGRPCAddr)
		}
	}
	
	kafkaConsumer := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaConsumerGroup, []string{"delivery.created"})
	defer kafkaConsumer.Close()

	kafkaPublisher := kafka.NewPublisher(cfg.KafkaBrokers, "delivery.driver.assigned")
	defer kafkaPublisher.Close()

	// Initialize dispatch service
	dispatchService := service.NewDispatchService(
		dispatchRedisClient,
		kafkaConsumer,
		kafkaPublisher,
		driverServiceGRPCAddr,
		cfg.OrderServiceURL,
		50.0, // max distance km
	)

	// Start dispatch consumer in background
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		if err := dispatchService.Start(ctx); err != nil && err != context.Canceled {
			log.Printf("Dispatch service error: %v", err)
		}
	}()

	// Initialize Gin router for health/metrics
	router := gin.Default()
	router.Use(otelgin.Middleware("dispatch-service"))

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "dispatch-service"})
	})

	router.GET("/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "metrics endpoint"})
	})

	// Swagger UI
	router.GET("/api/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

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

	log.Println("Shutting down Dispatch Service...")

	cancel() // Stop dispatch consumer

	// Close gRPC client
	if err := dispatchService.Close(); err != nil {
		log.Printf("Error closing gRPC client: %v", err)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// Deregister from Eureka
	if eurekaClient != nil {
		eurekaClient.Deregister(shutdownCtx)
	}

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	grpcServer.GracefulStop()

	log.Println("Dispatch Service stopped")
}

func initTracer(cfg *config.Config) (*sdktrace.TracerProvider, error) {
	ctx := context.Background()

	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(cfg.OTELExporter),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String("dispatch-service"),
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

func initRedis(cfg *config.Config) *goredis.Client {
	client := goredis.NewClient(&goredis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
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