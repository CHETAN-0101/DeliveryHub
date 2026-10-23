package main

// @title DeliveryHub API Gateway
// @version 1.0.0
// @description API Gateway for DeliveryHub microservices
// @host localhost:8080
// @BasePath /api/v1
// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization
// @description JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"

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
	"github.com/deliveryhub/go-common/eureka"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	_ "github.com/deliveryhub/api-gateway/internal/config"
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
	authMiddleware := middleware.NewAuthMiddleware(cfg.KeycloakURL, cfg.KeycloakRealm, cfg.KeycloakClientID)

	// Initialize Eureka client for service discovery
	var eurekaClient *eureka.Client
	var discovery *eureka.ServiceDiscovery
	var serviceClients map[string]*client.EurekaServiceClient

	if cfg.EurekaEnabled {
		eurekaConfig := eureka.DefaultClientConfig(cfg.AppName)
		eurekaConfig.EurekaURLs = cfg.EurekaURLs
		eurekaConfig.Username = cfg.EurekaUsername
		eurekaConfig.Password = cfg.EurekaPassword
		eurekaConfig.InstanceID = cfg.InstanceID
		eurekaConfig.HostName = cfg.HostName
		eurekaConfig.Port = cfg.PortInt
		eurekaConfig.HealthCheckURL = fmt.Sprintf("http://%s:%d/health", cfg.HostName, cfg.PortInt)
		eurekaConfig.HomePageURL = fmt.Sprintf("http://%s:%d", cfg.HostName, cfg.PortInt)
		eurekaConfig.StatusPageURL = fmt.Sprintf("http://%s:%d/actuator/info", cfg.HostName, cfg.PortInt)

		eurekaClient = eureka.NewClient(eurekaConfig)
		
		// Register with Eureka
		ctx := context.Background()
		if err := eurekaClient.Register(ctx); err != nil {
			log.Printf("Warning: failed to register with Eureka: %v", err)
		} else {
			log.Println("Registered with Eureka")
		}

		// Start heartbeat and registry fetch
		eurekaClient.StartHeartbeat(ctx)
		eurekaClient.StartRegistryFetch(ctx)
		defer eurekaClient.Stop()

		// Create service discovery helper
		discovery = eureka.NewServiceDiscovery(eurekaClient)

		// Create service clients with Eureka discovery
		serviceClients = make(map[string]*client.EurekaServiceClient)
		services := []string{"order-service", "driver-service", "dispatch-service", "notification-service", "ai-service"}
		for _, svc := range services {
			sc, err := client.NewEurekaServiceClient(svc, discovery, eurekaClient)
			if err != nil {
				log.Printf("Warning: failed to create Eureka client for %s: %v", svc, err)
			} else {
				serviceClients[svc] = sc
				sc.StartBackgroundRefresh(ctx, 30*time.Second)
			}
		}
	}

	// Initialize Gin router
	router := gin.Default()
	router.Use(otelgin.Middleware("api-gateway"))
	router.Use(middleware.CORS())
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

	// Swagger UI
	router.GET("/api/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Protected routes
	protected := router.Group("/api/v1")
	protected.Use(authMiddleware.Validate())
	{
		// Order service routes
		if orderClient := getServiceClient(serviceClients, "order-service", cfg.OrderServiceURL, "order-service"); orderClient != nil {
			orders := protected.Group("/deliveries")
			orders.Use(authMiddleware.RequireRoles("customer", "dispatcher", "admin"))
			{
				// Handle both /api/v1/deliveries (no trailing slash) and /api/v1/deliveries/* (with sub-path)
				orders.Any("", orderClient.HandleWithPrefix("/api/v1/deliveries"))
				orders.Any("/*path", orderClient.HandleWithPrefix("/api/v1/deliveries"))
			}
		}

		// Driver service routes
		if driverClient := getServiceClient(serviceClients, "driver-service", cfg.DriverServiceURL, "driver-service"); driverClient != nil {
			drivers := protected.Group("/drivers")
			drivers.Use(authMiddleware.RequireRoles("driver", "dispatcher", "admin", "customer"))
			{
				drivers.Any("", driverClient.HandleWithPrefix("/api/v1/drivers"))
				drivers.Any("/*path", driverClient.HandleWithPrefix("/api/v1/drivers"))
			}
		}

		// Dispatch service routes
		if dispatchClient := getServiceClient(serviceClients, "dispatch-service", cfg.DispatchServiceURL, "dispatch-service"); dispatchClient != nil {
			dispatch := protected.Group("/dispatch")
			dispatch.Use(authMiddleware.RequireRoles("dispatcher", "admin", "customer"))
			{
				dispatch.Any("", dispatchClient.HandleWithPrefix("/api/v1/dispatch"))
				dispatch.Any("/*path", dispatchClient.HandleWithPrefix("/api/v1/dispatch"))
			}
		}

		// Notification service routes
		if notificationClient := getServiceClient(serviceClients, "notification-service", cfg.NotificationServiceURL, "notification-service"); notificationClient != nil {
			notifications := protected.Group("/notifications")
			notifications.Use(authMiddleware.RequireRoles("customer", "driver", "dispatcher", "admin"))
			{
				notifications.Any("", notificationClient.HandleWithPrefix("/api/v1/notifications"))
				notifications.Any("/*path", notificationClient.HandleWithPrefix("/api/v1/notifications"))
			}
		}

		// AI service routes
		if aiClient := getServiceClient(serviceClients, "ai-service", cfg.AIServiceURL, "ai-service"); aiClient != nil {
			ai := protected.Group("/ai")
			ai.Use(authMiddleware.RequireRoles("customer", "driver", "dispatcher", "admin"))
			{
				ai.Any("", aiClient.HandleWithPrefix("/api/v1/ai"))
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

	// Deregister from Eureka
	if eurekaClient != nil {
		eurekaClient.Deregister(ctx)
	}

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("API Gateway stopped")
}

// getServiceClient returns the appropriate service client (Eureka or static)
func getServiceClient(eurekaClients map[string]*client.EurekaServiceClient, serviceName, fallbackURL, fallbackName string) interface{ Handle(gin.HandlerFunc) interface{ HandleWithPrefix(string) gin.HandlerFunc } } {
	if eurekaClients != nil {
		if sc, ok := eurekaClients[serviceName]; ok {
			return sc
		}
	}
	// Fallback to static client
	sc, err := client.NewServiceClient(fallbackURL, fallbackName)
	if err != nil {
		log.Printf("Warning: failed to create %s client: %v", fallbackName, err)
		return nil
	}
	return sc
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