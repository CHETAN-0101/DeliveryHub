package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deliveryhub/api-gateway/internal/client"
	"github.com/deliveryhub/api-gateway/internal/config"
	"github.com/deliveryhub/api-gateway/internal/handler"
	"github.com/deliveryhub/api-gateway/internal/middleware"
	"github.com/deliveryhub/api-gateway/internal/ratelimit"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
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

	// Initialize Redis for rate limiting
	redisClient := initRedis(cfg)
	defer redisClient.Close()

	// Initialize rate limiter
	rateLimiter := ratelimit.NewRateLimiter(redisClient, cfg.RateLimitRPS, cfg.RateLimitBurst)

	// Initialize auth middleware
	authMiddleware := middleware.NewAuthMiddleware(cfg.KeycloakURL, cfg.KeycloakRealm)

	// Initialize service clients
	orderClient, err := client.NewServiceClient(cfg.OrderServiceURL, "order-service")
	if err != nil {
		log.Printf("Warning: failed to create order service client: %v", err)
	}

	driverClient, err := client.NewServiceClient(cfg.DriverServiceURL, "driver-service")
	if err != nil {
		log.Printf("Warning: failed to create driver service client: %v", err)
	}

	dispatchClient, err := client.NewServiceClient(cfg.DispatchServiceURL, "dispatch-service")
	if err != nil {
		log.Printf("Warning: failed to create dispatch service client: %v", err)
	}

	notificationClient, err := client.NewServiceClient(cfg.NotificationServiceURL, "notification-service")
	if err != nil {
		log.Printf("Warning: failed to create notification service client: %v", err)
	}

	aiClient, err := client.NewServiceClient(cfg.AIServiceURL, "ai-service")
	if err != nil {
		log.Printf("Warning: failed to create AI service client: %v", err)
	}

	// Initialize Gin router
	router := gin.Default()
	router.Use(otelgin.Middleware("api-gateway"))
	router.Use(middleware.CorrelationID())
	router.Use(middleware.RequestID())
	router.Use(middleware.ErrorHandler())
	router.Use(middleware.Timeout(30 * time.Second))
	router.Use(rateLimiter.Middleware())

	// Health endpoints (no auth required)
	healthHandler := handler.NewHealthHandler()
	router.GET("/health", healthHandler.Health)
	router.GET("/ready", healthHandler.Ready)
	router.GET("/metrics", healthHandler.Metrics)

	// Protected routes
	protected := router.Group("/api/v1")
	protected.Use(authMiddleware.Validate())
	{
		// Order service routes
		if orderClient != nil {
			orders := protected.Group("/deliveries")
			orders.Use(authMiddleware.RequireRoles("customer", "dispatcher", "admin"))
			{
				orders.Any("/*path", orderClient.HandleWithPrefix("/api/v1/deliveries"))
			}
		}

		// Driver service routes
		if driverClient != nil {
			drivers := protected.Group("/drivers")
			drivers.Use(authMiddleware.RequireRoles("driver", "dispatcher", "admin"))
			{
				drivers.Any("/*path", driverClient.HandleWithPrefix("/api/v1/drivers"))
			}
		}

		// Dispatch service routes
		if dispatchClient != nil {
			dispatch := protected.Group("/dispatch")
			dispatch.Use(authMiddleware.RequireRoles("dispatcher", "admin"))
			{
				dispatch.Any("/*path", dispatchClient.HandleWithPrefix("/api/v1/dispatch"))
			}
		}

		// Notification service routes
		if notificationClient != nil {
			notifications := protected.Group("/notifications")
			notifications.Use(authMiddleware.RequireRoles("customer", "driver", "dispatcher", "admin"))
			{
				notifications.Any("/*path", notificationClient.HandleWithPrefix("/api/v1/notifications"))
			}
		}

		// AI service routes
		if aiClient != nil {
			ai := protected.Group("/ai")
			ai.Use(authMiddleware.RequireRoles("customer", "driver", "dispatcher", "admin"))
			{
				ai.Any("/*path", aiClient.HandleWithPrefix("/api/v1/ai"))
			}
		}
	}

	// Start HTTP server
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Starting API Gateway on port %s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down API Gateway...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("API Gateway stopped")
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
			semconv.ServiceNameKey.String("api-gateway"),
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

func initRedis(cfg *config.Config) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", getEnv("REDIS_HOST", "localhost"), getEnv("REDIS_PORT", "6379")),
		Password: getEnv("REDIS_PASSWORD", ""),
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

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}