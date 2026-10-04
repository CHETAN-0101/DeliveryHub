package main

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
	"github.com/gin-gonic/gin"
	goredis "github.com/go-redis/redis/v8"
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

	// Initialize Redis
	redisClient := initRedis(cfg)
	defer redisClient.Close()

	// Initialize Kafka
	dispatchRedisClient := pkgredis.NewDispatchRedisClient(redisClient)
	
	kafkaConsumer := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaConsumerGroup, []string{"delivery.created"})
	defer kafkaConsumer.Close()

	kafkaPublisher := kafka.NewPublisher(cfg.KafkaBrokers, "delivery.driver.assigned")
	defer kafkaPublisher.Close()

	// Initialize dispatch service
	dispatchService := service.NewDispatchService(
		dispatchRedisClient,
		kafkaConsumer,
		kafkaPublisher,
		cfg.DriverServiceGRPCAddr,
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

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

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