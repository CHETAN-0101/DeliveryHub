package handler

import (
	"net/http"

	"github.com/deliveryhub/ai-service/internal/service"
	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	service *service.AIService
}

func NewAIHandler(svc *service.AIService) *AIHandler {
	return &AIHandler{service: svc}
}

type ETAPredictionRequest struct {
	Distance       float64 `json:"distance" binding:"required,min=0"`
	DriverDistance float64 `json:"driverDistance" binding:"required,min=0"`
	AverageSpeed   float64 `json:"averageSpeed" binding:"required,min=1,max=120"`
	TrafficLevel   string  `json:"trafficLevel" binding:"required,oneof=LOW MEDIUM HIGH"`
	PackageWeight  float64 `json:"packageWeight" binding:"required,min=0"`
}

type RiskAnalysisRequest struct {
	DriverDistance  float64 `json:"driverDistance" binding:"required,min=0"`
	TrafficLevel    string  `json:"trafficLevel" binding:"required,oneof=LOW MEDIUM HIGH"`
	PackageWeight   float64 `json:"packageWeight" binding:"required,min=0"`
	WeatherCondition string `json:"weatherCondition" binding:"omitempty,oneof=CLEAR RAIN SNOW FOG"`
}

type AssistantRequest struct {
	Question string                 `json:"question" binding:"required"`
	Context  map[string]interface{} `json:"context,omitempty"`
}

func (h *AIHandler) PredictETA(c *gin.Context) {
	deliveryID := c.Param("id")
	
	var req ETAPredictionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.service.PredictETA(c.Request.Context(), deliveryID, 
		req.Distance, req.DriverDistance, req.AverageSpeed, req.TrafficLevel, req.PackageWeight)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AIHandler) AnalyzeRisk(c *gin.Context) {
	deliveryID := c.Param("id")
	
	var req RiskAnalysisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.service.AnalyzeRisk(c.Request.Context(), deliveryID,
		req.DriverDistance, req.TrafficLevel, req.PackageWeight, req.WeatherCondition)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AIHandler) AskAssistant(c *gin.Context) {
	var req AssistantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.service.AskAssistant(c.Request.Context(), req.Question, req.Context)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}