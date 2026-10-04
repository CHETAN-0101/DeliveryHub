package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/deliveryhub/ai-service/internal/provider"
	"github.com/google/uuid"
)

type AIService struct {
	provider provider.AIProvider
}

func NewAIService(provider provider.AIProvider) *AIService {
	return &AIService{provider: provider}
}

func (s *AIService) PredictETA(ctx context.Context, deliveryID string, distance, driverDistance, avgSpeed float64, trafficLevel string, packageWeight float64) (provider.ETAResponse, error) {
	req := provider.ETARequest{
		DeliveryID:     deliveryID,
		Distance:       distance,
		DriverDistance: driverDistance,
		AverageSpeed:   avgSpeed,
		TrafficLevel:   trafficLevel,
		PackageWeight:  packageWeight,
		TimeOfDay:      time.Now(),
	}
	
	return s.provider.PredictETA(ctx, req)
}

func (s *AIService) AnalyzeRisk(ctx context.Context, deliveryID string, driverDistance float64, trafficLevel string, packageWeight float64, weatherCondition string) (provider.RiskResponse, error) {
	req := provider.RiskRequest{
		DeliveryID:        deliveryID,
		DriverDistance:    driverDistance,
		TrafficLevel:      trafficLevel,
		PackageWeight:     packageWeight,
		TimeOfDay:         time.Now(),
		WeatherCondition:  weatherCondition,
	}
	
	return s.provider.AnalyzeRisk(ctx, req)
}

func (s *AIService) AskAssistant(ctx context.Context, question string, context map[string]interface{}) (provider.AssistantResponse, error) {
	req := provider.AssistantRequest{
		Question: question,
		Context:  context,
	}
	
	return s.provider.AskAssistant(ctx, req)
}

// GetDeliveryFeatures fetches delivery data to build AI features
func (s *AIService) GetDeliveryFeatures(ctx context.Context, deliveryID string) (map[string]interface{}, error) {
	// In production, this would call order-service and driver-service
	// For now, return mock data
	
	deliveryUUID, err := uuid.Parse(deliveryID)
	if err != nil {
		return nil, fmt.Errorf("invalid delivery ID: %w", err)
	}
	
	log.Printf("Fetching features for delivery %s", deliveryUUID)
	
	// Mock feature extraction
	return map[string]interface{}{
		"deliveryId":        deliveryID,
		"distance":          5.2,
		"driverDistance":    2.1,
		"averageSpeed":      25.0,
		"trafficLevel":      "MEDIUM",
		"packageWeight":     1.5,
		"timeOfDay":         time.Now(),
		"weatherCondition":  "CLEAR",
	}, nil
}