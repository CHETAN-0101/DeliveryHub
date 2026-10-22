# Build stage — context must be ../../services (parent of ai-service)
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

RUN apk add --no-cache git make

# Copy go-common (local dependency)
COPY go-common/ ./go-common/

# Copy this service
COPY ai-service/ ./ai-service/

WORKDIR /workspace/ai-service

# Download deps (go-common resolved via replace directive)
RUN go mod download || true
RUN go mod tidy

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ai-service ./cmd/ai

# Runtime stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

COPY --from=builder /workspace/ai-service/ai-service .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8085 9095

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8085/health || exit 1

ENTRYPOINT ["./ai-service"]