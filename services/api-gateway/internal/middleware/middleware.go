package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"sync"
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
	Roles    []string `json:"realm_access.roles"`
	Username string   `json:"preferred_username"`
	Issuer   string   `json:"iss"`
	Audience []string `json:"aud"`
	jwt.RegisteredClaims
}

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kty string   `json:"kty"`
	Kid string   `json:"kid"`
	Use string   `json:"use"`
	N   string   `json:"n"`
	E   string   `json:"e"`
	Alg string   `json:"alg"`
}

type AuthMiddleware struct {
	jwksURL       string
	expectedIssuer string
	expectedAudience string
	keyCache       map[string]*rsa.PublicKey
	cacheMutex     sync.RWMutex
	cacheExpiry    time.Time
	httpClient     *http.Client
}

func NewAuthMiddleware(keycloakURL, realm, clientID string) *AuthMiddleware {
	jwksURL := keycloakURL + "/realms/" + realm + "/protocol/openid-connect/certs"
	issuer := keycloakURL + "/realms/" + realm
	return &AuthMiddleware{
		jwksURL:          jwksURL,
		expectedIssuer:   issuer,
		expectedAudience: clientID,
		keyCache:         make(map[string]*rsa.PublicKey),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
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

		// Parse token header to get kid
		parser := jwt.NewParser(jwt.WithoutClaimsValidation())
		token, _, err := parser.ParseUnverified(tokenString, &JWTClaims{})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token format"})
			return
		}

		claims, ok := token.Claims.(*JWTClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		// Validate standard claims
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token expired"})
			return
		}

		// Validate issuer
		if m.expectedIssuer != "" && claims.Issuer != m.expectedIssuer {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token issuer"})
			return
		}

		// Validate audience
		if m.expectedAudience != "" {
			audienceValid := false
			for _, aud := range claims.Audience {
				if aud == m.expectedAudience {
					audienceValid = true
					break
				}
			}
			if !audienceValid {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token audience"})
				return
			}
		}

		// Get the signing key
		kid, ok := token.Header["kid"].(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing key ID in token header"})
			return
		}

		publicKey, err := m.getSigningKey(kid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unable to verify token signature"})
			return
		}

		// Verify token signature
		_, err = jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return publicKey, nil
		})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token signature"})
			return
		}

		// Set user context
		c.Set(UserIDKey, claims.UserID)
		c.Set(RolesKey, claims.Roles)
		c.Set(UsernameKey, claims.Username)

		c.Next()
	}
}

func (m *AuthMiddleware) getSigningKey(kid string) (*rsa.PublicKey, error) {
	// Check cache first
	m.cacheMutex.RLock()
	key, exists := m.keyCache[kid]
	if exists && time.Now().Before(m.cacheExpiry) {
		m.cacheMutex.RUnlock()
		return key, nil
	}
	m.cacheMutex.RUnlock()

	// Fetch JWKS
	m.cacheMutex.Lock()
	defer m.cacheMutex.Unlock()

	// Double-check after acquiring lock
	key, exists := m.keyCache[kid]
	if exists && time.Now().Before(m.cacheExpiry) {
		return key, nil
	}

	resp, err := m.httpClient.Get(m.jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("failed to fetch JWKS")
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, err
	}

	for _, jwk := range jwks.Keys {
		if jwk.Kid == kid && jwk.Kty == "RSA" {
			publicKey, err := parseRSAPublicKey(jwk.N, jwk.E)
			if err != nil {
				continue
			}
			m.keyCache[kid] = publicKey
			m.cacheExpiry = time.Now().Add(1 * time.Hour) // Cache for 1 hour
			return publicKey, nil
		}
	}

	return nil, errors.New("key not found in JWKS")
}

func parseRSAPublicKey(n, e string) (*rsa.PublicKey, error) {
	// Decode base64url encoded values
	nBytes, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, err
	}

	// Convert exponent
	exp := 0
	for _, b := range eBytes {
		exp = exp*256 + int(b)
	}

	// Create public key
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: exp,
	}, nil
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

// CORS adds permissive CORS headers so the frontend dev server (localhost:3001)
// can communicate with the API gateway (localhost:8080) without browser CORS errors.
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = "*"
		}
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Request-ID, X-Correlation-ID, Idempotency-Key")
		c.Header("Access-Control-Expose-Headers", "X-Request-ID, X-Correlation-ID, X-Served-By, Location")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
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