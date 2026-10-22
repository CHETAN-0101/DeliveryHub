package eureka

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
)

// ServiceDiscovery provides service discovery capabilities
type ServiceDiscovery struct {
	client     *Client
	httpClient *resty.Client
	cache      map[string]*url.URL
	cacheMu    sync.RWMutex
	cacheTTL   time.Duration
	lastFetch  map[string]time.Time
}

// NewServiceDiscovery creates a new service discovery helper
func NewServiceDiscovery(client *Client) *ServiceDiscovery {
	return &ServiceDiscovery{
		client:     client,
		httpClient: resty.New().SetTimeout(30 * time.Second),
		cache:      make(map[string]*url.URL),
		cacheTTL:   30 * time.Second,
		lastFetch:  make(map[string]time.Time),
	}
}

// ResolveService resolves a service name to a URL
func (sd *ServiceDiscovery) ResolveService(ctx context.Context, serviceName string) (*url.URL, error) {
	// Check cache first
	sd.cacheMu.RLock()
	if cachedURL, ok := sd.cache[strings.ToUpper(serviceName)]; ok {
		if lastFetch, ok := sd.lastFetch[strings.ToUpper(serviceName)]; ok {
			if time.Since(lastFetch) < sd.cacheTTL {
				sd.cacheMu.RUnlock()
				return cachedURL, nil
			}
		}
	}
	sd.cacheMu.RUnlock()

	// Fetch from Eureka
	instances := sd.client.GetInstances(serviceName)
	if len(instances) == 0 {
		return nil, fmt.Errorf("no instances found for service: %s", serviceName)
	}

	// Use first available instance (in production, implement load balancing)
	instance := &instances[0]
	baseURL := instance.GetInstanceURL()
	
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid instance URL: %w", err)
	}

	// Update cache
	sd.cacheMu.Lock()
	sd.cache[strings.ToUpper(serviceName)] = parsedURL
	sd.lastFetch[strings.ToUpper(serviceName)] = time.Now()
	sd.cacheMu.Unlock()

	return parsedURL, nil
}

// DoRequest executes an HTTP request to a service discovered via Eureka
func (sd *ServiceDiscovery) DoRequest(ctx context.Context, serviceName, method, path string, body interface{}, headers map[string]string) (*resty.Response, error) {
	serviceURL, err := sd.ResolveService(ctx, serviceName)
	if err != nil {
		return nil, err
	}

	fullURL := serviceURL.String() + path
	req := sd.httpClient.R().SetContext(ctx)

	if body != nil {
		req.SetBody(body)
	}

	for k, v := range headers {
		req.SetHeader(k, v)
	}

	return req.Execute(method, fullURL)
}

// Get executes a GET request
func (sd *ServiceDiscovery) Get(ctx context.Context, serviceName, path string, headers map[string]string) (*resty.Response, error) {
	return sd.DoRequest(ctx, serviceName, http.MethodGet, path, nil, headers)
}

// Post executes a POST request
func (sd *ServiceDiscovery) Post(ctx context.Context, serviceName, path string, body interface{}, headers map[string]string) (*resty.Response, error) {
	return sd.DoRequest(ctx, serviceName, http.MethodPost, path, body, headers)
}

// Put executes a PUT request
func (sd *ServiceDiscovery) Put(ctx context.Context, serviceName, path string, body interface{}, headers map[string]string) (*resty.Response, error) {
	return sd.DoRequest(ctx, serviceName, http.MethodPut, path, body, headers)
}

// Delete executes a DELETE request
func (sd *ServiceDiscovery) Delete(ctx context.Context, serviceName, path string, headers map[string]string) (*resty.Response, error) {
	return sd.DoRequest(ctx, serviceName, http.MethodDelete, path, nil, headers)
}

// HealthCheck checks the health of a service
func (sd *ServiceDiscovery) HealthCheck(ctx context.Context, serviceName string) error {
	instances := sd.client.GetInstances(serviceName)
	if len(instances) == 0 {
		return fmt.Errorf("no instances found for service: %s", serviceName)
	}

	// Use a short-timeout client for health checks
	healthClient := resty.New().SetTimeout(5 * time.Second)

	for _, instance := range instances {
		healthURL := instance.HealthCheckURL
		if healthURL == "" {
			healthURL = instance.GetInstanceURL() + "/health"
		}

		resp, err := healthClient.R().
			SetContext(ctx).
			Get(healthURL)

		if err == nil && resp.StatusCode() == http.StatusOK {
			return nil
		}
	}

	return fmt.Errorf("no healthy instances found for service: %s", serviceName)
}