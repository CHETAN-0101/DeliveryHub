package client

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type ServiceClient struct {
	proxy  *httputil.ReverseProxy
	target *url.URL
	name   string
}

func NewServiceClient(baseURL, name string) (*ServiceClient, error) {
	target, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid service URL %s: %w", baseURL, err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Custom director to preserve headers and add correlation ID
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		
		// Add correlation ID from context
		if corrID := req.Header.Get("X-Correlation-ID"); corrID != "" {
			req.Header.Set("X-Correlation-ID", corrID)
		}
		if reqID := req.Header.Get("X-Request-ID"); reqID != "" {
			req.Header.Set("X-Request-ID", reqID)
		}
		
		// Forward user info headers
		if userID := req.Header.Get("X-User-ID"); userID != "" {
			req.Header.Set("X-User-ID", userID)
		}
		if roles := req.Header.Get("X-User-Roles"); roles != "" {
			req.Header.Set("X-User-Roles", roles)
		}
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		// Log error but don't expose internal details
		fmt.Printf("Proxy error for %s: %v\n", name, err)
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error": "service temporarily unavailable"}`))
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		// Add service name header for debugging
		resp.Header.Set("X-Served-By", name)
		return nil
	}

	return &ServiceClient{
		proxy:  proxy,
		target: target,
		name:   name,
	}, nil
}

func (sc *ServiceClient) Handle(c *gin.Context) {
	// Forward the request
	sc.proxy.ServeHTTP(c.Writer, c.Request)
}

func (sc *ServiceClient) HandleWithPrefix(prefix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Rewrite path to remove the prefix
		originalPath := c.Request.URL.Path
		c.Request.URL.Path = strings.TrimPrefix(originalPath, prefix)
		if c.Request.URL.Path == "" {
			c.Request.URL.Path = "/"
		}
		
		// Save original path for potential restoration
		c.Request.Header.Set("X-Original-Path", originalPath)
		
		sc.Handle(c)
		
		// Restore original path
		c.Request.URL.Path = originalPath
	}
}

// Health check for downstream service
func (sc *ServiceClient) HealthCheck(ctx context.Context) error {
	client := &http.Client{Timeout: 5 * time.Second}
	healthURL := sc.target.String() + "/health"
	
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return err
	}
	
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("health check failed: %d - %s", resp.StatusCode, string(body))
	}
	
	return nil
}