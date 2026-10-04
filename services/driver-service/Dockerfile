# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git make

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download || go mod tidy

# Copy source code
COPY . .
RUN go mod tidy

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o driver-service ./cmd/driver

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates wget

# Create non-root user
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

# Copy binary
COPY --from=builder /app/driver-service .

# Change ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Expose ports
EXPOSE 8082 9092

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8082/health || exit 1

# Run
ENTRYPOINT ["./driver-service"]