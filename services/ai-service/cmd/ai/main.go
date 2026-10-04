package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deliveryhub/ai-service/internal/config"
	"github.com/deliveryhub/ai-service/internal/handler"
	"github.com/deliveryhub/ai-service/internal/provider"
	"github.com/deliveryhub/ai-service/internal/service"
	"github.com/gin-gonic/gin"
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

	// Initialize AI provider
	var aiProvider provider.AIProvider
	switch cfg.AIProvider {
	case "EXTERNAL":
		if cfg.AIAPIKey != "" && cfg.AIBaseURL != "" {
			aiProvider = provider.NewExternalAIProvider(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel)
			log.Println("Using external AI provider")
		} else {
			aiProvider = provider.NewMockAIProvider()
			log.Println("External AI config missing, falling back to mock provider")
		}
	default:
		aiProvider = provider.NewMockAIProvider()
		log.Println("Using mock AI provider")
	}

	// Initialize service
	aiService := service.NewAIService(aiProvider)

	// Initialize Gin router
	router := gin.Default()
	router.Use(otelgin.Middleware("ai-service"))

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "ai-service", "provider": aiProvider.Name()})
	})

	router.GET("/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "metrics endpoint"})
	})

	// API routes
	aiHandler := handler.NewAIHandler(aiService)
	v1 := router.Group("/api/v1/ai")
	{
		v1.POST("/deliveries/:id/eta", aiHandler.PredictETA)
		v1.POST("/deliveries/:id/risk", aiHandler.AnalyzeRisk)
		v1.POST("/assistant", aiHandler.AskAssistant)
	}

	// Start HTTP server
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Starting AI Service on port %s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down AI Service...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("AI Service stopped")
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
			semconv.ServiceNameKey.String("ai-service"),
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