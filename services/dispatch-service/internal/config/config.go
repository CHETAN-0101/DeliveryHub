package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                    string
	GRPCPort                string
	RedisHost               string
	RedisPort               string
	RedisPassword           string
	KafkaBrokers            string
	KafkaConsumerGroup      string
	DriverServiceGRPCAddr   string
	OrderServiceURL         string
	KeycloakURL             string
	KeycloakRealm           string
	OTELExporter            string
	LogLevel                string
	LogFormat               string
	
	// Eureka Configuration
	EurekaEnabled           bool
	EurekaURLs              []string
	EurekaUsername          string
	EurekaPassword          string
	AppName                 string
	InstanceID              string
	HostName                string
	PortInt                 int
	GRPCPortInt             int
}

func Load() *Config {
	port := getEnv("PORT", "8083")
	grpcPort := getEnv("GRPC_PORT", "9093")
	return &Config{
		Port:                    port,
		GRPCPort:                grpcPort,
		RedisHost:               getEnv("REDIS_HOST", "localhost"),
		RedisPort:               getEnv("REDIS_PORT", "6379"),
		RedisPassword:           getEnv("REDIS_PASSWORD", ""),
		KafkaBrokers:            getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaConsumerGroup:      getEnv("KAFKA_CONSUMER_GROUP", "dispatch-service-group"),
		DriverServiceGRPCAddr:   getEnv("DRIVER_SERVICE_GRPC_ADDR", "localhost:9092"),
		OrderServiceURL:         getEnv("ORDER_SERVICE_URL", "http://localhost:8081"),
		KeycloakURL:             getEnv("KEYCLOAK_URL", "http://localhost:8090"),
		KeycloakRealm:           getEnv("KEYCLOAK_REALM", "deliveryhub"),
		OTELExporter:            getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
		LogLevel:                getEnv("LOG_LEVEL", "INFO"),
		LogFormat:               getEnv("LOG_FORMAT", "json"),
		
		// Eureka Configuration
		EurekaEnabled:           getEnvBool("EUREKA_ENABLED", true),
		EurekaURLs:              getEnvSlice("EUREKA_URLS", []string{"http://admin:admin@eureka-server:8761/eureka"}),
		EurekaUsername:          getEnv("EUREKA_USERNAME", "admin"),
		EurekaPassword:          getEnv("EUREKA_PASSWORD", "admin"),
		AppName:                 getEnv("APP_NAME", "dispatch-service"),
		InstanceID:              getEnv("INSTANCE_ID", "dispatch-service:"+port),
		HostName:                getEnv("HOSTNAME", "localhost"),
		PortInt:                 getEnvInt("PORT_INT", 8083),
		GRPCPortInt:             getEnvInt("GRPC_PORT_INT", 9093),
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