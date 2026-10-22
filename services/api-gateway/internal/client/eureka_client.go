package client

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
	"time"

	"github.com/deliveryhub/go-common/eureka"
	"github.com/gin-gonic/gin"
)

// EurekaServiceClient wraps a reverse proxy with Eureka-based service discovery
type EurekaServiceClient struct {
	serviceName string
	discovery   *eureka.ServiceDiscovery
	eurekaClient *eureka.Client
	proxy       *httputil.ReverseProxy
	mu          sync.RWMutex
	targetURL   *url.URL
}

// NewEurekaServiceClient creates a new Eureka-based service client
func NewEurekaServiceClient(serviceName string, discovery *eureka.ServiceDiscovery, eurekaClient *eureka.Client) (*EurekaServiceClient, error) {
	sc := &EurekaServiceClient{
		serviceName:  serviceName,
		discovery:    discovery,
		eurekaClient: eurekaClient,
	}

	// Create initial proxy with a dummy target
	dummyURL, _ := url.Parse("http://localhost")
	sc.proxy = httputil.NewSingleHostReverseProxy(dummyURL)
	
	// Custom director to resolve service dynamically
	originalDirector := sc.proxy.Director
	sc.proxy.Director = func(req *http.Request) {
		originalDirector(req)
		
		// Resolve target URL from Eureka
		ctx := req.Context()
		targetURL, err := sc.resolveTargetURL(ctx)
		if err != nil {
			log.Printf("Failed to resolve %s: %v", serviceName, err)
			return
		}
		
		req.URL.Scheme = targetURL.Scheme
		req.URL.Host = targetURL.Host
		req.Host = targetURL.Host
		
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

	sc.proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("Proxy error for %s: %v", serviceName, err)
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error": "service temporarily unavailable"}`))
	}

	sc.proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("X-Served-By", serviceName)
		return nil
	}

	// Start background URL refresh
	go sc.refreshTargetURL(context.Background())

	return sc, nil
}

// resolveTargetURL resolves the target URL for the service
func (sc *EurekaServiceClient) resolveTargetURL(ctx context.Context) (*url.URL, error) {
	sc.mu.RLock()
	if sc.targetURL != nil {
		target := sc.targetURL
		sc.mu.RUnlock()
		return target, nil
	}
	sc.mu.RUnlock()

	return sc.refreshTargetURL(ctx)
}

// refreshTargetURL refreshes the target URL from Eureka
func (sc *EurekaServiceClient) refreshTargetURL(ctx context.Context) (*url.URL, error) {
	targetURL, err := sc.discovery.ResolveService(ctx, sc.serviceName)
	if err != nil {
		return nil, err
	}

	sc.mu.Lock()
	sc.targetURL = targetURL
	sc.mu.Unlock()

	log.Printf("Resolved %s to %s", sc.serviceName, targetURL.String())
	return targetURL, nil
}

// Handle proxies the request to the service
func (sc *EurekaServiceClient) Handle(c *gin.Context) {
	sc.proxy.ServeHTTP(c.Writer, c.Request)
}

// HandleWithPrefix proxies the request with the full path preserved.
// Downstream services already include their own path prefix (e.g., /api/v1).
func (sc *EurekaServiceClient) HandleWithPrefix(prefix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Header.Set("X-Original-Path", c.Request.URL.Path)
		_ = prefix // kept for documentation purposes only
		sc.Handle(c)
	}
}

// HealthCheck checks the health of the service via Eureka
func (sc *EurekaServiceClient) HealthCheck(ctx context.Context) error {
	return sc.discovery.HealthCheck(ctx, sc.serviceName)
}

// StartBackgroundRefresh starts background URL refresh
func (sc *EurekaServiceClient) StartBackgroundRefresh(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				sc.refreshTargetURL(ctx)
			}
		}
	}()
}