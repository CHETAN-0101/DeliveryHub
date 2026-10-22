package provider

import (
	"context"
	"math"
	"strings"
)

type MockAIProvider struct{}

func NewMockAIProvider() *MockAIProvider {
	return &MockAIProvider{}
}

// containsAny checks if the string contains any of the given substrings
func containsAny(s string, keywords ...string) bool {
	for _, k := range keywords {
		if strings.Contains(s, k) {
			return true
		}
	}
	return false
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
	q := strings.ToLower(req.Question)

	var answer string
	switch {
	case containsAny(q, "hello", "hi", "hey", "greet"):
		answer = "Hello! I'm the DeliveryHub AI Assistant. I can help you with:\n• Delivery status and tracking\n• ETA predictions and traffic analysis\n• Risk assessment for deliveries\n• Driver assignment recommendations\n• Route optimization\n• Performance summaries\n\nWhat would you like to know?"

	case containsAny(q, "help", "what can you", "capabilities", "feature"):
		answer = "Here's what I can help you with:\n\n📦 **Delivery Management**\n• Explain why a delivery is delayed\n• Track status transitions\n• Identify bottlenecks\n\n⏱ **ETA Predictions**\n• Calculate estimated delivery times\n• Factor in traffic, weather, and distance\n\n⚠️ **Risk Analysis**\n• Assess delivery risk (LOW/MEDIUM/HIGH)\n• Identify risk factors\n\n🚗 **Driver Operations**\n• Recommend best driver for assignment\n• Analyze driver performance\n\n📊 **Reports & Insights**\n• Weekly/daily performance summaries\n• Operational trends\n\nJust ask me anything!"

	case containsAny(q, "delay", "late", "slow", "stuck", "not moving"):
		answer = "Based on operational analysis, common delay causes include:\n\n1. **Traffic congestion** — HIGH traffic level adds 50% to base delivery time\n2. **Driver distance** — Drivers >10 km from pickup add 15-20 min overhead\n3. **Package weight** — Heavy packages (>20 kg) reduce speed by ~10%\n4. **Rush hours** — 7-9 AM and 5-7 PM add 30% time penalty\n\n**Recommendation:** Pre-position drivers in high-demand zones during peak hours and prioritize nearby driver assignment to reduce pickup distance."

	case containsAny(q, "eta", "time", "when", "arrive", "how long"):
		answer = "ETA calculation factors:\n\n• **Base time** = Distance ÷ Average Speed × 60 min\n• **Traffic multiplier**: LOW=0.9x, MEDIUM=1.2x, HIGH=1.5x\n• **Rush hour factor**: +30% (7-9 AM, 5-7 PM)\n• **Package weight factor**: +1% per kg\n• **Driver pickup time**: Driver Distance ÷ 30 km/h\n\n**Example:** 8 km delivery, 25 km/h avg speed, HIGH traffic, MEDIUM rush:\n→ Base: 8/25×60 = 19.2 min → ×1.5 (HIGH) = 28.8 min → +30% (rush) ≈ 37 min\n\nFor real-time ETA, use the ETA Insights page."

	case containsAny(q, "driver", "assign", "available", "who"):
		answer = "Driver assignment recommendations:\n\n✅ **Best practices:**\n• Prioritize drivers <3 km from pickup for fastest response\n• Check driver rating >4.0 for premium deliveries\n• Match vehicle type to package (TRUCK for heavy, BICYCLE for small urban)\n• AVAILABLE status required — RESERVED/BUSY drivers cannot accept new orders\n\n📊 **Current priorities:**\n1. Nearest AVAILABLE driver with matching vehicle\n2. Highest rated among equidistant options\n3. Driver with lowest active delivery count\n\nUse the Dispatch page to assign drivers manually or let the system auto-assign."

	case containsAny(q, "risk", "danger", "safe", "concern", "problem"):
		answer = "Risk assessment framework:\n\n🔴 **HIGH Risk (score ≥5):** Immediate attention required\n🟡 **MEDIUM Risk (score 2-4):** Monitor closely\n🟢 **LOW Risk (score <2):** Normal operations\n\n**Risk factors:**\n| Factor | Score |\n|--------|-------|\n| Driver >10 km away | +2 |\n| Driver 5-10 km away | +1 |\n| HIGH traffic | +3 |\n| MEDIUM traffic | +1 |\n| Heavy package >20 kg | +1 |\n| Rush hour | +1 |\n| Rain/Snow weather | +2 |\n\n**Mitigation:** Assign closer drivers, avoid scheduling heavy deliveries during peak traffic."

	case containsAny(q, "route", "path", "direction", "navigate", "map"):
		answer = "Route optimization principles used by DeliveryHub:\n\n🗺️ **Shortest path** — Minimize total distance while accounting for traffic\n⚡ **Time-optimal** — Prefer faster routes even if slightly longer\n🔄 **Dynamic rerouting** — Adjust in real-time based on traffic updates\n\n**Typical urban routing:**\n• Primary: Highways/arterials for long distances (>5 km)\n• Secondary: Local streets for last-mile (<2 km)\n• Avoid: Known congestion zones during peak hours\n\nRoute data is sourced from real-time traffic feeds. Drivers receive turn-by-turn guidance via their mobile app."

	case containsAny(q, "performance", "stats", "summary", "report", "week", "metric"):
		answer = "📊 **Operational Performance Summary:**\n\n**Delivery Metrics:**\n• Success rate: 91-94% (industry avg: 88%)\n• Average ETA accuracy: ±3.2 minutes\n• Average delivery time: 28 minutes\n\n**Driver Metrics:**\n• Average rating: 4.3/5.0\n• Peak active drivers: 18-22 (weekday 11AM-2PM)\n• Average deliveries per driver/day: 8.4\n\n**Risk Distribution:**\n• LOW risk: ~68% of deliveries\n• MEDIUM risk: ~24%\n• HIGH risk: ~8%\n\n**Recommendations:** Focus on reducing HIGH-risk deliveries by improving driver pre-positioning and weather monitoring integration."

	case containsAny(q, "cancel", "cancellation", "refund", "abort"):
		answer = "**Delivery cancellation analysis:**\n\nTop cancellation reasons:\n1. Customer unavailable at dropoff (34%)\n2. Address not found (21%)\n3. Package damaged during transit (12%)\n4. Traffic/delivery too late (18%)\n5. Driver no-show (15%)\n\n**Reducing cancellations:**\n• Send proactive ETA notifications to customers\n• Enable real-time driver tracking for customers\n• Validate addresses before dispatch\n• Set realistic delivery windows based on AI predictions"

	case containsAny(q, "kafka", "event", "message", "queue", "stream"):
		answer = "**DeliveryHub Event Architecture:**\n\nKafka topics in use:\n• `delivery.created` — New delivery order placed\n• `delivery.assigned` — Driver assigned to delivery\n• `delivery.picked_up` — Package picked up by driver\n• `delivery.in_transit` — Delivery in progress\n• `delivery.completed` — Delivery successful\n• `delivery.cancelled` — Delivery cancelled\n• `driver.location_updated` — Real-time driver GPS updates\n• `notification.send` — Push/SMS/email notifications triggered\n\nAll events flow through the Dispatch service which orchestrates state transitions."

	default:
		answer = "I'm analyzing your query about delivery operations. Here's a general overview:\n\n**DeliveryHub System Status:**\n• Order Service: Manages delivery lifecycle\n• Driver Service: Tracks driver location and status\n• Dispatch Service: Auto-assigns drivers via AI scoring\n• AI Service: ETA predictions and risk analysis\n• Notification Service: Customer/driver alerts\n\nFor specific insights, try asking about:\n• A specific delivery delay or ETA\n• Driver assignment recommendations\n• Risk analysis for current deliveries\n• Performance reports\n\nOr visit the AI Insights page for visual analytics."
	}

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