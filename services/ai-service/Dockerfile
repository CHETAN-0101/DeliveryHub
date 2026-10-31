# Build stage — context must be ../../services (parent of ai-service)
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

RUN apk add --no-cache git

# Copy go-common (local dependency)
COPY go-common/ ./go-common/

# Copy this service
COPY ai-service/ ./ai-service/

WORKDIR /workspace/ai-service

# Download dependencies (go-common resolved via replace directive)
RUN go mod download

# Build with stripped debug info for smaller binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -o ai-service ./cmd/ai

# Runtime stage — minimal Alpine
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

COPY --from=builder /workspace/ai-service/ai-service .

RUN chown appuser:appgroup /app/ai-service

USER appuser

EXPOSE 8085 9098

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:8085/health || exit 1

ENTRYPOINT ["./ai-service"]