# Build stage — context must be ../../services (parent of api-gateway)
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

# Install only what's needed (no make)
RUN apk add --no-cache git

# Copy go-common (local dependency)
COPY go-common/ ./go-common/

# Copy this service
COPY api-gateway/ ./api-gateway/

WORKDIR /workspace/api-gateway

# Download dependencies (go-common resolved via replace directive pointing to ../go-common)
RUN go mod download

# Build with stripped debug info for smaller binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -o api-gateway ./cmd/gateway

# Runtime stage — minimal Alpine
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

COPY --from=builder /workspace/api-gateway/api-gateway .

RUN chown appuser:appgroup /app/api-gateway

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["./api-gateway"]