# DeliveryHub Makefile
# Build, test, and deployment automation

.PHONY: help build test test-unit test-integration test-e2e lint docker-build docker-up docker-down k8s-apply k8s-delete clean

# Default target
help:
	@echo "DeliveryHub - Available Commands:"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build              - Build all services"
	@echo "  make build-java         - Build Java services only"
	@echo "  make build-go           - Build Go services only"
	@echo "  make docker-build       - Build all Docker images"
	@echo ""
	@echo "Test Commands:"
	@echo "  make test               - Run all tests (unit + integration)"
	@echo "  make test-unit          - Run unit tests only"
	@echo "  make test-integration   - Run integration tests (requires Docker)"
	@echo "  make test-e2e           - Run end-to-end test"
	@echo ""
	@echo "Development Commands:"
	@echo "  make docker-up          - Start all services with Docker Compose"
	@echo "  make docker-down        - Stop all services"
	@echo "  make docker-logs        - View Docker Compose logs"
	@echo "  make lint               - Run linters on all services"
	@echo ""
	@echo "Kubernetes Commands:"
	@echo "  make k8s-apply          - Apply Kubernetes manifests"
	@echo "  make k8s-delete         - Delete Kubernetes resources"
	@echo "  make k8s-logs           - View Kubernetes pod logs"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make clean              - Clean build artifacts"
	@echo "  make generate-docs      - Generate API documentation"
	@echo "  make seed-data          - Seed development data"

# ===========================================
# Build Targets
# ===========================================

build: build-java build-go

build-java:
	@echo "Building Java services..."
	cd services/order-service && ./mvnw clean package -DskipTests
	cd services/notification-service && ./mvnw clean package -DskipTests

build-go:
	@echo "Building Go services..."
	cd services/api-gateway && go build -o bin/api-gateway ./cmd/gateway
	cd services/driver-service && go build -o bin/driver-service ./cmd/driver
	cd services/dispatch-service && go build -o bin/dispatch-service ./cmd/dispatch
	cd services/ai-service && go build -o bin/ai-service ./cmd/ai

docker-build:
	@echo "Building Docker images..."
	docker compose -f infra/docker-compose/docker-compose.yml build

# ===========================================
# Test Targets
# ===========================================

test: test-unit test-integration

test-unit:
	@echo "Running unit tests..."
	cd services/order-service && ./mvnw test
	cd services/notification-service && ./mvnw test
	cd services/api-gateway && go test ./...
	cd services/driver-service && go test ./...
	cd services/dispatch-service && go test ./...
	cd services/ai-service && go test ./...

test-integration:
	@echo "Running integration tests..."
	cd services/order-service && ./mvnw verify -Pintegration
	cd services/notification-service && ./mvnw verify -Pintegration
	cd services/api-gateway && go test -tags=integration ./...
	cd services/driver-service && go test -tags=integration ./...
	cd services/dispatch-service && go test -tags=integration ./...
	cd services/ai-service && go test -tags=integration ./...

test-e2e:
	@echo "Running end-to-end tests..."
	cd scripts && ./run-e2e-tests.sh

# ===========================================
# Development Targets
# ===========================================

docker-up:
	@echo "Starting Docker Compose stack..."
	docker compose -f infra/docker-compose/docker-compose.yml up --build -d
	@echo "Waiting for services to be healthy..."
	@sleep 30
	docker compose -f infra/docker-compose/docker-compose.yml ps

docker-down:
	@echo "Stopping Docker Compose stack..."
	docker compose -f infra/docker-compose/docker-compose.yml down -v

docker-logs:
	docker compose -f infra/docker-compose/docker-compose.yml logs -f

lint:
	@echo "Running linters..."
	cd services/order-service && ./mvnw checkstyle:check
	cd services/notification-service && ./mvnw checkstyle:check
	cd services/api-gateway && golangci-lint run
	cd services/driver-service && golangci-lint run
	cd services/dispatch-service && golangci-lint run
	cd services/ai-service && golangci-lint run

# ===========================================
# Kubernetes Targets
# ===========================================

k8s-apply:
	@echo "Applying Kubernetes manifests..."
	kubectl apply -f infra/kubernetes/namespace.yaml
	kubectl apply -f infra/kubernetes/configmaps/
	kubectl apply -f infra/kubernetes/secrets/
	kubectl apply -f infra/kubernetes/services/
	kubectl apply -f infra/kubernetes/deployments/
	kubectl apply -f infra/kubernetes/ingress/
	kubectl apply -f infra/kubernetes/hpa/

k8s-delete:
	@echo "Deleting Kubernetes resources..."
	kubectl delete -f infra/kubernetes/ --ignore-not-found=true

k8s-logs:
	kubectl logs -n deliveryhub -l app=$(SERVICE) -f

# ===========================================
# Utility Targets
# ===========================================

clean:
	@echo "Cleaning build artifacts..."
	cd services/order-service && ./mvnw clean
	cd services/notification-service && ./mvnw clean
	cd services/api-gateway && rm -rf bin/
	cd services/driver-service && rm -rf bin/
	cd services/dispatch-service && rm -rf bin/
	cd services/ai-service && rm -rf bin/
	docker system prune -f

generate-docs:
	@echo "Generating API documentation..."
	cd services/order-service && ./mvnw springdoc:generate
	cd services/notification-service && ./mvnw springdoc:generate

generate-proto:
	@echo "Generating gRPC code from proto files..."
	@which protoc-gen-go > /dev/null || go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	@which protoc-gen-go-grpc > /dev/null || go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	protoc --proto_path=contracts/proto \
		--go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		contracts/proto/driver.proto
	@echo "gRPC code generated successfully"

seed-data:
	@echo "Seeding development data..."
	cd scripts && ./seed-data.sh

# ===========================================
# Service-specific Targets
# ===========================================

# Order Service
order-build:
	cd services/order-service && ./mvnw clean package

order-test:
	cd services/order-service && ./mvnw test

order-run:
	cd services/order-service && ./mvnw spring-boot:run

# Driver Service
driver-build:
	cd services/driver-service && go build -o bin/driver-service ./cmd/driver

driver-test:
	cd services/driver-service && go test ./...

driver-run:
	cd services/driver-service && go run ./cmd/driver

# Dispatch Service
dispatch-build:
	cd services/dispatch-service && go build -o bin/dispatch-service ./cmd/dispatch

dispatch-test:
	cd services/dispatch-service && go test ./...

dispatch-run:
	cd services/dispatch-service && go run ./cmd/dispatch

# API Gateway
gateway-build:
	cd services/api-gateway && go build -o bin/api-gateway ./cmd/gateway

gateway-test:
	cd services/api-gateway && go test ./...

gateway-run:
	cd services/api-gateway && go run ./cmd/gateway

# Notification Service
notification-build:
	cd services/notification-service && ./mvnw clean package

notification-test:
	cd services/notification-service && ./mvnw test

notification-run:
	cd services/notification-service && ./mvnw spring-boot:run

# AI Service
ai-build:
	cd services/ai-service && go build -o bin/ai-service ./cmd/ai

ai-test:
	cd services/ai-service && go test ./...

ai-run:
	cd services/ai-service && go run ./cmd/ai