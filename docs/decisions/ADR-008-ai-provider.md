# ADR-008: AI Provider Abstraction

## Status
Accepted

## Context
DeliveryHub's AI Service provides ETA prediction, risk analysis, and an AI assistant. The AI/ML landscape evolves rapidly with new models (GPT-4, Claude, Llama, custom models) and serving platforms (OpenAI, Anthropic, Vertex AI, SageMaker, Triton, self-hosted). The system must support swapping providers without code changes.

## Decision
Define an `AIProvider` interface with multiple implementations:
- **MockAIProvider**: Deterministic algorithm, no external dependencies
- **ExternalAIProvider**: HTTP/gRPC client for external APIs
- **Future**: Self-hosted model server (Triton, TGI, vLLM)

The active provider is selected via configuration (`AI_PROVIDER=MOCK|EXTERNAL`).

## Interface Design

```go
type AIProvider interface {
    Name() string
    PredictETA(ctx context.Context, req ETARequest) (ETAResponse, error)
    AnalyzeRisk(ctx context.Context, req RiskRequest) (RiskResponse, error)
    AskAssistant(ctx context.Context, req AssistantRequest) (AssistantResponse, error)
}

type ETARequest struct {
    DeliveryID      string
    Distance        float64
    DriverDistance  float64
    AverageSpeed    float64
    TrafficLevel    string  // LOW, MEDIUM, HIGH
    PackageWeight   float64
    TimeOfDay       time.Time
}

type ETAResponse struct {
    DeliveryID   string
    ETAMinutes   int
    Confidence   float64  // 0.0 - 1.0
}

type RiskRequest struct {
    DeliveryID       string
    DriverDistance   float64
    TrafficLevel     string
    PackageWeight    float64
    TimeOfDay        time.Time
    WeatherCondition string
}

type RiskResponse struct {
    DeliveryID string
    Risk       string  // LOW, MEDIUM, HIGH
    Reasons    []string
}

type AssistantRequest struct {
    Question string
    Context  map[string]interface{}
}

type AssistantResponse struct {
    Answer string
}
```

## Implementations

### MockAIProvider (Default)
- **Deterministic**: Same input → same output (testable, reproducible)
- **No External Dependencies**: Works offline, in CI/CD, air-gapped
- **Realistic Logic**: 
  - ETA: Distance/speed + traffic multiplier + time-of-day + driver distance
  - Risk: Scoring based on distance, traffic, weight, weather, rush hour
  - Assistant: Template responses with delivery context injection
- **Use Cases**: Development, testing, demos, fallback

### ExternalAIProvider (Production)
- **HTTP Client**: Calls external API (OpenAI, Anthropic, custom)
- **Configuration**: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
- **Features**:
  - Request/response transformation (internal ↔ provider format)
  - Timeout (30s), retry (3x exponential backoff)
  - Circuit breaker (fail fast on repeated failures)
  - Fallback to MockAIProvider on error
  - Request/response logging (sanitized)
- **Provider Agnostic**: Works with any OpenAI-compatible API

### Future: Self-Hosted Provider
- **Triton Inference Server**: Multi-model, dynamic batching, GPU optimization
- **TGI (Text Generation Inference)**: Optimized LLM serving
- **vLLM**: High-throughput LLM inference
- **ONNX Runtime**: Cross-platform model format
- **Integration**: gRPC client to model server, feature store integration

## Configuration

```yaml
# Development
AI_PROVIDER: MOCK

# Production
AI_PROVIDER: EXTERNAL
AI_API_KEY: ${SECRET_AI_API_KEY}
AI_BASE_URL: https://api.openai.com/v1
AI_MODEL: gpt-4-turbo
```

## Factory Pattern
```go
func NewAIProvider(cfg *config.Config) provider.AIProvider {
    switch cfg.AIProvider {
    case "EXTERNAL":
        if cfg.AIAPIKey != "" && cfg.AIBaseURL != "" {
            return provider.NewExternalAIProvider(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel)
        }
        log.Warn("External AI config incomplete, falling back to mock")
        fallthrough
    default:
        return provider.NewMockAIProvider()
    }
}
```

## Alternatives Considered

### Direct Integration (No Abstraction)
**Pros**: Simpler code, direct API calls
**Cons**: 
- Vendor lock-in
- Hard to test (mocking HTTP calls)
- Can't swap models without deployment
- No fallback strategy

### Feature Flags Only
**Pros**: Simple toggle
**Cons**: 
- Code still coupled to provider
- Can't test alternative implementations
- No clean fallback

### Separate Microservice per Model
**Pros**: Independent scaling, polyglot
**Cons**: 
- Operational overhead (6+ AI services)
- Network latency between services
- Complex routing logic

## Consequences

### Positive
- **Testability**: MockAIProvider for unit/integration tests
- **Vendor Independence**: Swap OpenAI → Anthropic → self-hosted
- **Cost Control**: Mock for dev, cheaper model for prod, fallback on quota
- **Reliability**: Circuit breaker + fallback prevents cascade failures
- **Development Velocity**: Works offline, no API keys needed
- **Compliance**: Air-gapped deployment possible with mock/self-hosted

### Negative
- **Interface Maintenance**: Must keep `AIProvider` stable
- **Feature Parity**: Mock must approximate real behavior
- **Abstraction Leakage**: Provider-specific features hard to expose
- **Complexity**: Factory, config, fallback logic

## Testing Strategy

### Unit Tests (MockAIProvider)
```go
func TestMockAIProvider_PredictETA(t *testing.T) {
    p := provider.NewMockAIProvider()
    resp, _ := p.PredictETA(ctx, provider.ETARequest{
        Distance: 5.0, DriverDistance: 1.0, AverageSpeed: 25.0,
        TrafficLevel: "MEDIUM", PackageWeight: 1.0,
    })
    assert.True(t, resp.ETAMinutes > 0)
    assert.InDelta(t, 0.9, resp.Confidence, 0.1)
}
```

### Integration Tests (ExternalAIProvider)
```go
func TestExternalAIProvider_PredictETA(t *testing.T) {
    if testing.Short() { t.Skip("requires API key") }
    p := provider.NewExternalAIProvider(apiKey, baseURL, model)
    resp, err := p.PredictETA(ctx, req)
    assert.NoError(t, err)
    assert.Greater(t, resp.ETAMinutes, 0)
}
```

### Contract Tests
- Verify all implementations satisfy `AIProvider` interface
- Test error handling (timeout, rate limit, invalid response)
- Validate fallback behavior

## Monitoring & Observability

### Metrics
```go
// Per-provider metrics
ai_requests_total{provider="mock",endpoint="eta"}
ai_request_duration_seconds{provider="external",endpoint="risk"}
ai_fallback_total{from="external",to="mock"}
ai_confidence_histogram{provider="external"}
```

### Tracing
```go
// OpenTelemetry spans
ctx, span := tracer.Start(ctx, "AI.PredictETA",
    trace.WithAttributes(
        attribute.String("ai.provider", p.Name()),
        attribute.String("ai.endpoint", "eta"),
    ))
defer span.End()
```

### Drift Detection
- Log prediction vs actual delivery time
- Alert on confidence calibration drift
- A/B testing framework for model comparison

## Rollout Strategy

### Canary Deployment
1. **100% Mock** → Baseline metrics
2. **10% External** → Compare latency, accuracy, cost
3. **50% External** → Monitor error rates, fallback triggers
4. **100% External** → Full rollout

### Feature Flags
```go
// Gradual rollout per feature
if featureFlag.IsEnabled("ai.eta.external", userID) {
    return externalProvider.PredictETA(...)
}
return mockProvider.PredictETA(...)
```

## Related ADRs
- ADR-002: Polyglot (Go for AI Service)
- ADR-006: REST vs gRPC (AI Service uses REST)
- ADR-003: Kafka (AI events for training data)
- ADR-001: Microservices (AI as separate service)