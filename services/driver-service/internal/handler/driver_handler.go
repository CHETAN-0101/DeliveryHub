package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/deliveryhub/driver-service/internal/model"
	"github.com/deliveryhub/driver-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DriverHandler struct {
	service *service.DriverService
}

func NewDriverHandler(svc *service.DriverService) *DriverHandler {
	return &DriverHandler{service: svc}
}

type CreateDriverRequest struct {
	Name         string  `json:"name" binding:"required,min=2,max=200"`
	Phone        string  `json:"phone" binding:"required,min=10,max=50"`
	Email        string  `json:"email" binding:"omitempty,email"`
	VehicleType  string  `json:"vehicleType" binding:"required,oneof=MOTORCYCLE CAR BICYCLE VAN TRUCK"`
	LicensePlate string  `json:"licensePlate" binding:"omitempty,max=20"`
}

type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=OFFLINE AVAILABLE RESERVED BUSY"`
}

type UpdateLocationRequest struct {
	Latitude  float64  `json:"latitude" binding:"required,min=-90,max=90"`
	Longitude float64  `json:"longitude" binding:"required,min=-180,max=180"`
	Accuracy  *float64 `json:"accuracy,omitempty"`
	Heading   *float64 `json:"heading,omitempty"`
	Speed     *float64 `json:"speed,omitempty"`
}

func (h *DriverHandler) CreateDriver(c *gin.Context) {
	var req CreateDriverRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	driver, err := h.service.CreateDriver(c.Request.Context(), req.Name, req.Phone, req.Email, req.VehicleType, req.LicensePlate)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, driver)
}

func (h *DriverHandler) GetDriver(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid driver ID"})
		return
	}

	driver, err := h.service.GetDriver(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "driver not found"})
		return
	}

	c.JSON(http.StatusOK, driver)
}

func (h *DriverHandler) UpdateDriverStatus(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid driver ID"})
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newStatus := model.DriverStatus(req.Status)
	if !newStatus.IsValid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	if err := h.service.UpdateStatus(c.Request.Context(), id, newStatus); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}

func (h *DriverHandler) UpdateDriverLocation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid driver ID"})
		return
	}

	var req UpdateLocationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.UpdateLocation(c.Request.Context(), id, req.Latitude, req.Longitude, req.Accuracy, req.Heading, req.Speed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "location updated"})
}

func (h *DriverHandler) GetDriverLocation(c *gin.Context) {
	idStr := c.Param("id")
	if _, err := uuid.Parse(idStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid driver ID"})
		return
	}

	lat, lon, found := h.service.GetDriverLocation(c.Request.Context(), idStr)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "location not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"driverId":   idStr,
		"latitude":   lat,
		"longitude":  lon,
		"updatedAt":  time.Now(),
	})
}

func (h *DriverHandler) ListDrivers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	
	if limit > 100 {
		limit = 100
	}

	drivers, err := h.service.ListDrivers(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"drivers": drivers,
		"limit":   limit,
		"offset":  offset,
	})
}