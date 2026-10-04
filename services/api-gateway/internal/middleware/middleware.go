package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	AuthorizationHeader = "Authorization"
	BearerPrefix        = "Bearer "
	CorrelationIDHeader = "X-Correlation-ID"
	RequestIDHeader     = "X-Request-ID"
	UserIDKey           = "user_id"
	RolesKey            = "roles"
	UsernameKey         = "username"
)

type JWTClaims struct {
	UserID   string   `json:"sub"`
	Roles    []string `json:"roles"`
	Username string   `json:"preferred_username"`
	jwt.RegisteredClaims
}

type AuthMiddleware struct {
	jwksURL string
}

func NewAuthMiddleware(keycloakURL, realm string) *AuthMiddleware {
	jwksURL := keycloakURL + "/realms/" + realm + "/protocol/openid-connect/certs"
	return &AuthMiddleware{jwksURL: jwksURL}
}

func (m *AuthMiddleware) Validate() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader(AuthorizationHeader)
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		if !strings.HasPrefix(authHeader, BearerPrefix) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)

		// In production, fetch JWKS from Keycloak and validate properly
		// For now, we'll parse without verification (dev mode)
		// TODO: Implement proper JWKS validation
		token, _, err := new(jwt.Parser).ParseUnverified(tokenString, &JWTClaims{})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		claims, ok := token.Claims.(*JWTClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		// Check expiration
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token expired"})
			return
		}

		// Set user context
		c.Set(UserIDKey, claims.UserID)
		c.Set(RolesKey, claims.Roles)
		c.Set(UsernameKey, claims.Username)

		c.Next()
	}
}

func (m *AuthMiddleware) RequireRoles(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		rolesVal, exists := c.Get(RolesKey)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "no roles found"})
			return
		}

		userRoles, ok := rolesVal.([]string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid roles format"})
			return
		}

		hasRole := false
		for _, userRole := range userRoles {
			for _, allowed := range allowedRoles {
				if userRole == allowed {
					hasRole = true
					break
				}
			}
			if hasRole {
				break
			}
		}

		if !hasRole {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}

		c.Next()
	}
}

func CorrelationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		correlationID := c.GetHeader(CorrelationIDHeader)
		if correlationID == "" {
			correlationID = uuid.New().String()
		}
		c.Set(CorrelationIDHeader, correlationID)
		c.Header(CorrelationIDHeader, correlationID)
		c.Next()
	}
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader(RequestIDHeader)
		if requestID == "" {
			requestID = uuid.New().String()
		}
		c.Set(RequestIDHeader, requestID)
		c.Header(RequestIDHeader, requestID)
		c.Next()
	}
}

func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			correlationID := c.GetString(CorrelationIDHeader)
			requestID := c.GetString(RequestIDHeader)

			c.JSON(http.StatusInternalServerError, gin.H{
				"error":        "internal server error",
				"traceId":      correlationID,
				"requestId":    requestID,
				"message":      err.Error(),
			})
		}
	}
}

func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)

		done := make(chan struct{})
		go func() {
			c.Next()
			close(done)
		}()

		select {
		case <-done:
			return
		case <-ctx.Done():
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{
				"error":   "request timeout",
				"timeout": timeout.String(),
			})
		}
	}
}

func GetUserID(c *gin.Context) (string, bool) {
	val, exists := c.Get(UserIDKey)
	if !exists {
		return "", false
	}
	id, ok := val.(string)
	return id, ok
}

func GetUserRoles(c *gin.Context) ([]string, bool) {
	val, exists := c.Get(RolesKey)
	if !exists {
		return nil, false
	}
	roles, ok := val.([]string)
	return roles, ok
}