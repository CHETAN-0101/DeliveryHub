package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port              string
	KeycloakURL       string
	KeycloakRealm     string
	KeycloakClientID  string
	KeycloakClientSecret string
	
	// Eureka Configuration
	EurekaEnabled     bool
	EurekaURLs        []string
	EurekaUsername    string
	EurekaPassword    string
	AppName           string
	InstanceID        string
	HostName          string
	PortInt           int
	
	// Static URLs (fallback when Eureka is disabled)
	OrderServiceURL   string
	DriverServiceURL  string
	DispatchServiceURL string
	NotificationServiceURL string
	AIServiceURL      string
	
	RateLimitRPS      int
	RateLimitBurst    int
	OTELExporter      string
	LogLevel          string
	LogFormat         string
}

func Load() *Config {
	port := getEnv("PORT", "8080")
	return &Config{
		Port:                    port,
		KeycloakURL:             getEnv("KEYCLOAK_URL", "http://localhost:8090"),
		KeycloakRealm:           getEnv("KEYCLOAK_REALM", "deliveryhub"),
		KeycloakClientID:        getEnv("KEYCLOAK_CLIENT_ID", "delivery-client"),
		KeycloakClientSecret:    getEnv("KEYCLOAK_CLIENT_SECRET", "delivery-secret"),
		
		// Eureka Configuration
		EurekaEnabled:     getEnvBool("EUREKA_ENABLED", true),
		EurekaURLs:        getEnvSlice("EUREKA_URLS", []string{"http://admin:admin@eureka-server:8761/eureka"}),
		EurekaUsername:    getEnv("EUREKA_USERNAME", "admin"),
		EurekaPassword:    getEnv("EUREKA_PASSWORD", "admin"),
		AppName:           getEnv("APP_NAME", "api-gateway"),
		InstanceID:        getEnv("INSTANCE_ID", "api-gateway:"+port),
		HostName:          getEnv("HOSTNAME", "localhost"),
		PortInt:           getEnvInt("PORT_INT", 8080),
		
		// Static URLs (fallback)
		OrderServiceURL:         getEnv("ORDER_SERVICE_URL", "http://localhost:8081"),
		DriverServiceURL:        getEnv("DRIVER_SERVICE_URL", "http://localhost:8082"),
		DispatchServiceURL:      getEnv("DISPATCH_SERVICE_URL", "http://localhost:8083"),
		NotificationServiceURL:  getEnv("NOTIFICATION_SERVICE_URL", "http://localhost:8084"),
		AIServiceURL:            getEnv("AI_SERVICE_URL", "http://localhost:8085"),
		
		RateLimitRPS:            getEnvInt("RATE_LIMIT_RPS", 100),
		RateLimitBurst:          getEnvInt("RATE_LIMIT_BURST", 200),
		OTELExporter:            getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
		LogLevel:                getEnv("LOG_LEVEL", "INFO"),
		LogFormat:               getEnv("LOG_FORMAT", "json"),
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