package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	GRPCPort       string
	KafkaBrokers   string
	OrderServiceURL string
	DriverServiceURL string
	AIProvider     string
	AIAPIKey       string
	AIBaseURL      string
	AIModel        string
	AITemperature  float64
	AIMaxTurns     int
	KeycloakURL    string
	KeycloakRealm  string
	OTELExporter   string
	LogLevel       string
	LogFormat      string
	
	// Eureka Configuration
	EurekaEnabled   bool
	EurekaURLs      []string
	EurekaUsername  string
	EurekaPassword  string
	AppName         string
	InstanceID      string
	HostName        string
	PortInt         int
	GRPCPortInt     int
}

func Load() *Config {
	port := getEnv("PORT", "8085")
	grpcPort := getEnv("GRPC_PORT", "9095")
	return &Config{
		Port:              port,
		GRPCPort:          grpcPort,
		KafkaBrokers:      getEnv("KAFKA_BROKERS", "localhost:9092"),
		OrderServiceURL:   getEnv("ORDER_SERVICE_URL", "http://localhost:8081"),
		DriverServiceURL:  getEnv("DRIVER_SERVICE_URL", "http://localhost:8082"),
		AIProvider:        getEnv("AI_PROVIDER", "CEREBRAS"),
		AIAPIKey:          strings.TrimSpace(getEnv("CEREBRAS_API_KEY", getEnv("AI_API_KEY", ""))),
		AIBaseURL:         getEnv("AI_BASE_URL", "https://api.cerebras.ai/v1"),
		AIModel:           getEnv("LLM_MODEL", getEnv("AI_MODEL", "gpt-oss-120b")),
		AITemperature:     getEnvFloat("TEMPERATURE", 0.2),
		AIMaxTurns:        getEnvInt("MAX_TURNS", 45),
		KeycloakURL:       getEnv("KEYCLOAK_URL", "http://localhost:8090"),
		KeycloakRealm:     getEnv("KEYCLOAK_REALM", "deliveryhub"),
		OTELExporter:      getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
		LogLevel:          getEnv("LOG_LEVEL", "INFO"),
		LogFormat:         getEnv("LOG_FORMAT", "json"),
		
		// Eureka Configuration
		EurekaEnabled:   getEnvBool("EUREKA_ENABLED", true),
		EurekaURLs:      getEnvSlice("EUREKA_URLS", []string{"http://admin:admin@eureka-server:8761/eureka"}),
		EurekaUsername:  getEnv("EUREKA_USERNAME", "admin"),
		EurekaPassword:  getEnv("EUREKA_PASSWORD", "admin"),
		AppName:         getEnv("APP_NAME", "ai-service"),
		InstanceID:      getEnv("INSTANCE_ID", "ai-service:"+port),
		HostName:        getEnv("HOSTNAME", "localhost"),
		PortInt:         getEnvInt("PORT_INT", 8085),
		GRPCPortInt:     getEnvInt("GRPC_PORT_INT", 9095),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil && intVal > 0 {
			return intVal
		}
	}
	return defaultValue
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if floatVal, err := strconv.ParseFloat(value, 64); err == nil && floatVal >= 0 && floatVal <= 2 {
			return floatVal
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if dur, err := time.ParseDuration(value); err == nil {
			return dur
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		parts := strings.Split(value, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			trimmed := strings.TrimSpace(p)
			if trimmed != "" {
				result = append(result, trimmed)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultValue
}
