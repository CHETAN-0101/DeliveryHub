package eureka

import (
	"context"
	"encoding/xml"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/google/uuid"
)

// Client is the Eureka client
type Client struct {
	config    *ClientConfig
	client    *resty.Client
	registry  map[string][]Instance
	mu        sync.RWMutex
	stopCh    chan struct{}
	wg        sync.WaitGroup
	registered bool
}

// NewClient creates a new Eureka client
func NewClient(config *ClientConfig) *Client {
	c := resty.New()
	c.SetBasicAuth(config.Username, config.Password)
	c.SetTimeout(10 * time.Second)
	c.SetRetryCount(3)
	c.SetRetryWaitTime(1 * time.Second)
	c.SetRetryMaxWaitTime(5 * time.Second)

	return &Client{
		config:   config,
		client:   c,
		registry: make(map[string][]Instance),
		stopCh:   make(chan struct{}),
	}
}

// getHostname returns the hostname
func getHostname() (string, error) {
	return net.LookupHost("")
}

// getLocalIP returns the local IP address
func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// Register registers this instance with Eureka
func (c *Client) Register(ctx context.Context) error {
	instance := c.buildInstanceXML()
	
	for _, eurekaURL := range c.config.EurekaURLs {
		url := strings.TrimSuffix(eurekaURL, "/") + "/apps/" + c.config.AppName
		resp, err := c.client.R().
			SetContext(ctx).
			SetHeader("Content-Type", "application/xml").
			SetHeader("Accept", "application/json").
			SetBody(instance).
			Post(url)
		
		if err == nil && resp.StatusCode() >= 200 && resp.StatusCode() < 300 {
			c.mu.Lock()
			c.registered = true
			c.mu.Unlock()
			return nil
		}
	}
	
	return fmt.Errorf("failed to register with any Eureka server")
}

// Deregister deregisters this instance from Eureka
func (c *Client) Deregister(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	if !c.registered {
		return nil
	}

	for _, eurekaURL := range c.config.EurekaURLs {
		url := strings.TrimSuffix(eurekaURL, "/") + "/apps/" + c.config.AppName + "/" + c.config.InstanceID
		_, err := c.client.R().
			SetContext(ctx).
			Delete(url)
		
		if err == nil {
			c.registered = false
			return nil
		}
	}
	
	return fmt.Errorf("failed to deregister from any Eureka server")
}

// StartHeartbeat starts sending heartbeats to Eureka
func (c *Client) StartHeartbeat(ctx context.Context) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		ticker := time.NewTicker(c.config.RenewalInterval)
		defer ticker.Stop()
		
		for {
			select {
			case <-ctx.Done():
				return
			case <-c.stopCh:
				return
			case <-ticker.C:
				c.sendHeartbeat(ctx)
			}
		}
	}()
}

// sendHeartbeat sends a heartbeat to Eureka
func (c *Client) sendHeartbeat(ctx context.Context) {
	c.mu.RLock()
	registered := c.registered
	c.mu.RUnlock()
	
	if !registered {
		return
	}
	
	for _, eurekaURL := range c.config.EurekaURLs {
		url := strings.TrimSuffix(eurekaURL, "/") + "/apps/" + c.config.AppName + "/" + c.config.InstanceID
		resp, err := c.client.R().
			SetContext(ctx).
			Put(url)
		
		if err == nil && resp.StatusCode() >= 200 && resp.StatusCode() < 300 {
			return
		}
	}
}

// StartRegistryFetch starts fetching registry from Eureka
func (c *Client) StartRegistryFetch(ctx context.Context) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		// Initial fetch
		c.fetchRegistry(ctx)
		
		ticker := time.NewTicker(c.config.FetchInterval)
		defer ticker.Stop()
		
		for {
			select {
			case <-ctx.Done():
				return
			case <-c.stopCh:
				return
			case <-ticker.C:
				c.fetchRegistry(ctx)
			}
		}
	}()
}

// fetchRegistry fetches the registry from Eureka
func (c *Client) fetchRegistry(ctx context.Context) {
	for _, eurekaURL := range c.config.EurekaURLs {
		url := strings.TrimSuffix(eurekaURL, "/") + "/apps"
		resp, err := c.client.R().
			SetContext(ctx).
			SetHeader("Accept", "application/xml").
			Get(url)
		
		if err != nil {
			continue
		}
		
		if resp.StatusCode() >= 200 && resp.StatusCode() < 300 {
			var apps Applications
			if err := xml.Unmarshal(resp.Body(), &apps); err == nil {
				c.mu.Lock()
				for _, app := range apps.Applications {
					var instances []Instance
					for _, inst := range app.Instances {
						if inst.Status == "UP" {
							instances = append(instances, inst)
						}
					}
					if len(instances) > 0 {
						c.registry[app.Name] = instances
					}
				}
				c.mu.Unlock()
			}
			return
		}
	}
}

// GetInstances returns all instances for a given app name
func (c *Client) GetInstances(appName string) []Instance {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	instances := c.registry[strings.ToUpper(appName)]
	if instances == nil {
		return []Instance{}
	}
	
	// Return a copy
	result := make([]Instance, len(instances))
	copy(result, instances)
	return result
}

// GetInstance returns a single instance for a given app name (round-robin)
func (c *Client) GetInstance(appName string) *Instance {
	instances := c.GetInstances(appName)
	if len(instances) == 0 {
		return nil
	}
	
	// Simple round-robin (in production, use better load balancing)
	return &instances[0]
}

// GetInstanceURL returns the base URL for an instance
func (i *Instance) GetInstanceURL() string {
	if i.HomePageURL != "" {
		return i.HomePageURL
	}
	protocol := "http"
	if i.SecurePort.Enabled && i.SecurePort.Port > 0 {
		protocol = "https"
	}
	host := i.IPAddr
	if i.HostName != "" {
		host = i.HostName
	}
	port := i.Port.Port
	if i.Port.Enabled && i.Port.Port > 0 {
		port = i.Port.Port
	}
	return fmt.Sprintf("%s://%s:%d", protocol, host, port)
}

// Stop stops the client
func (c *Client) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

// buildInstanceXML builds the XML for instance registration
func (c *Client) buildInstanceXML() string {
	instance := Instance{
		InstanceID: c.config.InstanceID,
		HostName:   c.config.HostName,
		App:        strings.ToUpper(c.config.AppName),
		IPAddr:     c.config.IPAddr,
		Status:     "UP",
		Port: Port{
			Port:    c.config.Port,
			Enabled: true,
		},
		SecurePort: SecurePort{
			Port:    c.config.SecurePort,
			Enabled: false,
		},
		HomePageURL:      c.config.HomePageURL,
		StatusPageURL:    c.config.StatusPageURL,
		HealthCheckURL:   c.config.HealthCheckURL,
		VIPAddress:       c.config.VIPAddress,
		SecureVIPAddress: c.config.SecureVIPAddress,
		DataCenterInfo: DataCenterInfo{
			Name: "MyOwn",
			Class: "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
		},
		Metadata: c.config.Metadata,
	}
	
	data, _ := xml.MarshalIndent(instance, "", "  ")
	return string(data)
}