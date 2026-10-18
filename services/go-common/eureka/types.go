package eureka

import (
	"encoding/xml"
	"time"
)

// Application represents an Eureka application
type Application struct {
	Name        string     `xml:"name"`
	Instances   []Instance `xml:"instance"`
}

// Instance represents a service instance in Eureka
type Instance struct {
	InstanceID       string            `xml:"instanceId"`
	HostName         string            `xml:"hostName"`
	App              string            `xml:"app"`
	IPAddr           string            `xml:"ipAddr"`
	Status           string            `xml:"status"`
	Port             Port              `xml:"port"`
	SecurePort       SecurePort        `xml:"securePort"`
	HomePageURL      string            `xml:"homePageUrl"`
	StatusPageURL    string            `xml:"statusPageUrl"`
	HealthCheckURL   string            `xml:"healthCheckUrl"`
	VIPAddress       string            `xml:"vipAddress"`
	SecureVIPAddress string            `xml:"secureVipAddress"`
	DataCenterInfo   DataCenterInfo    `xml:"dataCenterInfo"`
	Metadata         map[string]string `xml:"metadata"`
	LastUpdated      string            `xml:"lastUpdatedTimestamp"`
}

// Port represents the port configuration
type Port struct {
	Port    int  `xml:",chardata"`
	Enabled bool `xml:"enabled,attr"`
}

// SecurePort represents the secure port configuration
type SecurePort struct {
	Port    int  `xml:",chardata"`
	Enabled bool `xml:"enabled,attr"`
}

// DataCenterInfo represents data center information
type DataCenterInfo struct {
	Name string `xml:"name"`
	Class string `xml:"class,attr"`
}

// Applications represents the list of applications
type Applications struct {
	XMLName      xml.Name      `xml:"applications"`
	VersionsDelta string       `xml:"versionsDelta"`
	AppsHashcode string       `xml:"appsHashcode"`
	Applications []Application `xml:"application"`
}

// InstanceInfo holds instance registration information
type InstanceInfo struct {
	AppName        string
	InstanceID     string
	HostName       string
	IPAddr         string
	Port           int
	SecurePort     int
	HomePageURL    string
	StatusPageURL  string
	HealthCheckURL string
	VIPAddress     string
	SecureVIPAddress string
	DataCenterInfo DataCenterInfo
	Metadata       map[string]string
}

// ClientConfig holds Eureka client configuration
type ClientConfig struct {
	EurekaURLs       []string
	AppName          string
	InstanceID       string
	HostName         string
	IPAddr           string
	Port             int
	SecurePort       int
	HomePageURL      string
	StatusPageURL    string
	HealthCheckURL   string
	VIPAddress       string
	SecureVIPAddress string
	Metadata         map[string]string
	RenewalInterval  time.Duration
	FetchInterval    time.Duration
	Username         string
	Password         string
}

// DefaultClientConfig returns a default configuration
func DefaultClientConfig(appName string) *ClientConfig {
	hostname, _ := getHostname()
	return &ClientConfig{
		EurekaURLs:       []string{"http://admin:admin@localhost:8761/eureka"},
		AppName:          appName,
		InstanceID:       appName + ":" + hostname + ":" + uuid.New().String()[:8],
		HostName:         hostname,
		IPAddr:           getLocalIP(),
		Port:             8080,
		SecurePort:       8443,
		HomePageURL:      "http://" + hostname + ":8080",
		StatusPageURL:    "http://" + hostname + ":8080/actuator/info",
		HealthCheckURL:   "http://" + hostname + ":8080/health",
		VIPAddress:       appName,
		SecureVIPAddress: appName,
		Metadata: map[string]string{
			"zone":    "default",
			"version": "1.0.0",
		},
		RenewalInterval:  30 * time.Second,
		FetchInterval:    30 * time.Second,
		Username:         "admin",
		Password:         "admin",
	}
}