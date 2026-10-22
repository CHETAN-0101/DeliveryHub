# Build stage — context must be ../../services (parent of dispatch-service)
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

RUN apk add --no-cache git make

# Copy go-common (local dependency)
COPY go-common/ ./go-common/

# Copy this service
COPY dispatch-service/ ./dispatch-service/

WORKDIR /workspace/dispatch-service

RUN go mod download || true
RUN go mod tidy

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o dispatch-service ./cmd/dispatch

# Runtime stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

COPY --from=builder /workspace/dispatch-service/dispatch-service .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8083 9093

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8083/health || exit 1

ENTRYPOINT ["./dispatch-service"]