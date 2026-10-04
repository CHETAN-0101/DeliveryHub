package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port              string
	GRPCPort          string
	DBHost            string
	DBPort            string
	DBName            string
	DBUser            string
	DBPassword        string
	RedisHost         string
	RedisPort         string
	RedisPassword     string
	KafkaBrokers      string
	KafkaConsumerGroup string
	KeycloakURL       string
	KeycloakRealm     string
	OTELexporter      string
	LogLevel          string
	LogFormat         string
}

func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8082"),
		GRPCPort:          getEnv("GRPC_PORT", "9092"),
		DBHost:            getEnv("DB_HOST", "localhost"),
		DBPort:            getEnv("DB_PORT", "5432"),
		DBName:            getEnv("DB_NAME", "driver_db"),
		DBUser:            getEnv("DB_USER", "driver_user"),
		DBPassword:        getEnv("DB_PASSWORD", "driver_password"),
		RedisHost:         getEnv("REDIS_HOST", "localhost"),
		RedisPort:         getEnv("REDIS_PORT", "6379"),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		KafkaBrokers:      getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "driver-service-group"),
		KeycloakURL:       getEnv("KEYCLOAK_URL", "http://localhost:8090"),
		KeycloakRealm:     getEnv("KEYCLOAK_REALM", "deliveryhub"),
		OTELexporter:      getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
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