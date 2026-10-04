package provider

import (
	"context"
	"math"
)

type MockAIProvider struct{}

func NewMockAIProvider() *MockAIProvider {
	return &MockAIProvider{}
}

func (m *MockAIProvider) Name() string {
	return "MOCK"
}

func (m *MockAIProvider) PredictETA(ctx context.Context, req ETARequest) (ETAResponse, error) {
	// Deterministic algorithm based on distance and traffic
	baseTime := req.Distance / req.AverageSpeed * 60 // minutes
	
	// Add driver travel time to pickup
	driverTime := req.DriverDistance / 30.0 * 60 // assume 30 km/h average
	
	// Traffic multiplier
	trafficMultiplier := 1.0
	switch req.TrafficLevel {
	case "LOW":
		trafficMultiplier = 0.9
	case "MEDIUM":
		trafficMultiplier = 1.2
	case "HIGH":
		trafficMultiplier = 1.5
	}
	
	// Time of day factor (rush hour)
	hour := req.TimeOfDay.Hour()
	timeFactor := 1.0
	if (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) {
		timeFactor = 1.3
	}
	
	// Package weight factor (heavier = slower)
	weightFactor := 1.0 + (req.PackageWeight / 100.0)
	
	totalMinutes := (baseTime + driverTime) * trafficMultiplier * timeFactor * weightFactor
	
	// Add some deterministic variance based on delivery ID hash
	hash := 0
	for _, c := range req.DeliveryID {
		hash = hash*31 + int(c)
	}
	variance := (float64(hash%10) - 5) * 0.5 // -2.5 to +2.5 minutes
	
	etaMinutes := int(math.Round(totalMinutes + variance))
	if etaMinutes < 5 {
		etaMinutes = 5
	}
	
	// Confidence based on factors
	confidence := 0.95
	if req.TrafficLevel == "HIGH" {
		confidence = 0.85
	}
	if req.DriverDistance > 10 {
		confidence -= 0.1
	}
	
	return ETAResponse{
		DeliveryID: req.DeliveryID,
		ETAMinutes: etaMinutes,
		Confidence: confidence,
	}, nil
}

func (m *MockAIProvider) AnalyzeRisk(ctx context.Context, req RiskRequest) (RiskResponse, error) {
	var reasons []string
	riskScore := 0
	
	// Driver distance factor
	if req.DriverDistance > 10 {
		riskScore += 2
		reasons = append(reasons, "Driver is far from pickup location (>10 km)")
	} else if req.DriverDistance > 5 {
		riskScore += 1
		reasons = append(reasons, "Driver is moderately far from pickup location (>5 km)")
	}
	
	// Traffic factor
	switch req.TrafficLevel {
	case "HIGH":
		riskScore += 3
		reasons = append(reasons, "High traffic levels in the area")
	case "MEDIUM":
		riskScore += 1
		reasons = append(reasons, "Moderate traffic levels")
	}
	
	// Package weight
	if req.PackageWeight > 20 {
		riskScore += 1
		reasons = append(reasons, "Heavy package (>20 kg)")
	}
	
	// Time of day
	hour := req.TimeOfDay.Hour()
	if (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) {
		riskScore += 1
		reasons = append(reasons, "Rush hour traffic expected")
	}
	
	// Weather
	if req.WeatherCondition == "RAIN" || req.WeatherCondition == "SNOW" {
		riskScore += 2
		reasons = append(reasons, "Adverse weather conditions")
	}
	
	var risk string
	switch {
	case riskScore >= 5:
		risk = "HIGH"
	case riskScore >= 2:
		risk = "MEDIUM"
	default:
		risk = "LOW"
	}
	
	if len(reasons) == 0 {
		reasons = append(reasons, "No significant risk factors identified")
	}
	
	return RiskResponse{
		DeliveryID: req.DeliveryID,
		Risk:       risk,
		Reasons:    reasons,
	}, nil
}

func (m *MockAIProvider) AskAssistant(ctx context.Context, req AssistantRequest) (AssistantResponse, error) {
	// Simple rule-based responses
	answer := "I can help you with delivery status, ETA predictions, and risk analysis. "
	answer += "For specific delivery information, please provide a delivery ID."
	
	return AssistantResponse{Answer: answer}, nil
}

// ExternalAIProvider is a placeholder for real AI integration
type ExternalAIProvider struct {
	apiKey  string
	baseURL string
	model   string
}

func NewExternalAIProvider(apiKey, baseURL, model string) *ExternalAIProvider {
	return &ExternalAIProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
	}
}

func (e *ExternalAIProvider) Name() string {
	return "EXTERNAL"
}

func (e *ExternalAIProvider) PredictETA(ctx context.Context, req ETARequest) (ETAResponse, error) {
	// TODO: Implement actual API call to external AI service
	// For now, fall back to mock logic
	return NewMockAIProvider().PredictETA(ctx, req)
}

func (e *ExternalAIProvider) AnalyzeRisk(ctx context.Context, req RiskRequest) (RiskResponse, error) {
	return NewMockAIProvider().AnalyzeRisk(ctx, req)
}

func (e *ExternalAIProvider) AskAssistant(ctx context.Context, req AssistantRequest) (AssistantResponse, error) {
	return NewMockAIProvider().AskAssistant(ctx, req)
}