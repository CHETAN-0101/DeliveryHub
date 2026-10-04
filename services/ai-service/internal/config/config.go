package config

import (
	"os"
	"strconv"
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
	KeycloakURL    string
	KeycloakRealm  string
	OTELExporter   string
	LogLevel       string
	LogFormat      string
}

func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8085"),
		GRPCPort:          getEnv("GRPC_PORT", "9095"),
		KafkaBrokers:      getEnv("KAFKA_BROKERS", "localhost:9092"),
		OrderServiceURL:   getEnv("ORDER_SERVICE_URL", "http://localhost:8081"),
		DriverServiceURL:  getEnv("DRIVER_SERVICE_URL", "http://localhost:8082"),
		AIProvider:        getEnv("AI_PROVIDER", "MOCK"),
		AIAPIKey:          getEnv("AI_API_KEY", ""),
		AIBaseURL:         getEnv("AI_BASE_URL", ""),
		AIModel:           getEnv("AI_MODEL", "gpt-4"),
		KeycloakURL:       getEnv("KEYCLOAK_URL", "http://localhost:8090"),
		KeycloakRealm:     getEnv("KEYCLOAK_REALM", "deliveryhub"),
		OTELExporter:      getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
		LogLevel:          getEnv("LOG_LEVEL", "INFO"),
		LogFormat:         getEnv("LOG_FORMAT", "json"),
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
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
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