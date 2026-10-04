package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "api-gateway",
		"version": "1.0.0",
	})
}

func (h *HealthHandler) Ready(c *gin.Context) {
	// Check downstream services if needed
	c.JSON(http.StatusOK, gin.H{
		"status": "ready",
	})
}

func (h *HealthHandler) Metrics(c *gin.Context) {
	// Prometheus metrics endpoint would be here
	c.JSON(http.StatusOK, gin.H{
		"message": "metrics endpoint - integrate with prometheus client",
	})
}