module github.com/deliveryhub/api-gateway

go 1.22

require (
	github.com/deliveryhub/go-common v0.0.0
	github.com/gin-gonic/gin v1.9.1
	github.com/go-redis/redis/v8 v8.11.5
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/google/uuid v1.5.0
	github.com/swaggo/gin-swagger v1.6.0
	github.com/swaggo/swag v1.16.3
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.21.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin v0.46.1
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/deliveryhub/go-common => ../../go-common