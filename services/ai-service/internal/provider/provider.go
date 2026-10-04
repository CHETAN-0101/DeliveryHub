package provider

import (
	"context"
	"time"
)

type ETARequest struct {
	DeliveryID      string
	Distance        float64
	DriverDistance  float64
	AverageSpeed    float64
	TrafficLevel    string // LOW, MEDIUM, HIGH
	PackageWeight   float64
	TimeOfDay       time.Time
}

type ETAResponse struct {
	DeliveryID   string
	ETAMinutes   int
	Confidence   float64
}

type RiskRequest struct {
	DeliveryID      string
	DriverDistance  float64
	TrafficLevel    string
	PackageWeight   float64
	TimeOfDay       time.Time
	WeatherCondition string
}

type RiskResponse struct {
	DeliveryID string
	Risk       string // LOW, MEDIUM, HIGH
	Reasons    []string
}

type AssistantRequest struct {
	Question string
	Context  map[string]interface{}
}

type AssistantResponse struct {
	Answer string
}

type AIProvider interface {
	Name() string
	PredictETA(ctx context.Context, req ETARequest) (ETAResponse, error)
	AnalyzeRisk(ctx context.Context, req RiskRequest) (RiskResponse, error)
	AskAssistant(ctx context.Context, req AssistantRequest) (AssistantResponse, error)
}