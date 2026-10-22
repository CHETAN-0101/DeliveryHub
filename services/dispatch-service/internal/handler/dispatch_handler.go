package handler

import (
	"net/http"
	"strconv"

	"github.com/deliveryhub/dispatch-service/pkg/redis"
	"github.com/gin-gonic/gin"
)

// DispatchHandler serves the HTTP API for the dispatch service.
// The frontend calls /api/v1/dispatch/events and /api/v1/dispatch/stats.
type DispatchHandler struct {
	redisClient *redis.DispatchRedisClient
}

// NewDispatchHandler creates a new dispatch HTTP handler.
func NewDispatchHandler(redisClient *redis.DispatchRedisClient) *DispatchHandler {
	return &DispatchHandler{redisClient: redisClient}
}

// GetEvents returns recent dispatch events stored in Redis.
// GET /api/v1/dispatch/events?limit=50
func (h *DispatchHandler) GetEvents(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	events, err := h.redisClient.GetRecentEvents(c.Request.Context(), limit)
	if err != nil {
		// Return empty list so the frontend degrades gracefully
		c.JSON(http.StatusOK, gin.H{"events": []redis.DispatchEventEntry{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"events": events})
}

// GetStats returns aggregate dispatch statistics.
// GET /api/v1/dispatch/stats
func (h *DispatchHandler) GetStats(c *gin.Context) {
	stats, err := h.redisClient.GetStats(c.Request.Context())
	if err != nil {
		// Return zeroed stats rather than an error
		c.JSON(http.StatusOK, map[string]interface{}{
			"started":     0,
			"assigned":    0,
			"completed":   0,
			"failed":      0,
			"retried":     0,
			"successRate": 0.0,
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}
