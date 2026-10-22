# Build stage — context must be ../../services (parent of driver-service)
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

RUN apk add --no-cache git make

# Copy go-common (local dependency)
COPY go-common/ ./go-common/

# Copy this service
COPY driver-service/ ./driver-service/

WORKDIR /workspace/driver-service

RUN go mod download || true
RUN go mod tidy

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o driver-service ./cmd/driver

# Runtime stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

COPY --from=builder /workspace/driver-service/driver-service .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8082 9092

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8082/health || exit 1

ENTRYPOINT ["./driver-service"]