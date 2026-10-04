# DeliveryHub Security Documentation

## Authentication & Authorization

### Identity Provider: Keycloak

Keycloak serves as the central OAuth2/OIDC identity provider with the following configuration:

- **Realm**: `deliveryhub`
- **Clients**: `delivery-client` (confidential)
- **Flows**: Authorization Code, Resource Owner Password Credentials, Client Credentials
- **Token Format**: JWT (RS256)

### Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `customer` | End users creating deliveries | Create deliveries, view own deliveries, cancel own deliveries |
| `driver` | Delivery drivers | View assigned deliveries, update status, update location |
| `dispatcher` | Operations staff | View all deliveries, manage drivers, manual assignment |
| `admin` | System administrators | All permissions, user management, system config |

### JWT Claims

```json
{
  "sub": "user-uuid",
  "preferred_username": "customer1",
  "email": "customer@example.com",
  "realm_access": {
    "roles": ["customer"]
  },
  "resource_access": {
    "delivery-client": {
      "roles": []
    }
  },
  "exp": 1705315800,
  "iat": 1705312200
}
```

## API Security

### Gateway-Level Protection

All external traffic passes through the API Gateway which enforces:

1. **JWT Validation**: Signature verification using Keycloak JWKS
2. **Rate Limiting**: Token bucket (100 req/s, burst 200)
3. **CORS**: Restricted to allowed origins
4. **Request Size Limits**: 10MB max body
5. **Timeouts**: 30s default, configurable per route

### Service-Level Authorization

Each service validates authorization for sensitive operations:

```java
// Order Service - Customer can only access own deliveries
@PreAuthorize("hasRole('CUSTOMER') and @deliverySecurity.isOwner(#id, authentication)")
public DeliveryResponse getDelivery(UUID id, Jwt jwt)

// Driver Service - Drivers can only update own location
@PreAuthorize("hasRole('DRIVER') and @driverSecurity.isOwner(#id, authentication)")
public void updateLocation(UUID id, LocationRequest request, Jwt jwt)
```

### Role-Based Route Access

| Route | Required Roles |
|-------|---------------|
| `POST /api/v1/deliveries` | `customer`, `admin` |
| `GET /api/v1/deliveries/{id}` | `customer` (owner), `dispatcher`, `admin` |
| `POST /api/v1/deliveries/{id}/cancel` | `customer` (owner), `admin` |
| `POST /api/v1/drivers` | `dispatcher`, `admin` |
| `PATCH /api/v1/drivers/{id}/status` | `driver` (owner), `dispatcher`, `admin` |
| `POST /api/v1/drivers/{id}/location` | `driver` (owner) |
| `GET /api/v1/ai/deliveries/{id}/eta` | `customer` (owner), `driver` (assigned), `dispatcher`, `admin` |

## Token Management

### Access Tokens
- **Lifetime**: 1 hour (3600 seconds)
- **Algorithm**: RS256
- **Audience**: `delivery-client`
- **Issuer**: `https://keycloak.example.com/realms/deliveryhub`

### Refresh Tokens
- **Lifetime**: 30 days
- **Rotation**: Enabled
- **Reuse Detection**: Enabled

### Client Credentials (Service-to-Service)
- Used for async workers, scheduled jobs
- Separate client per service: `order-service`, `dispatch-service`, etc.
- Scopes: `delivery:read`, `delivery:write`, `driver:read`, `driver:write`

## Transport Security

### TLS Configuration
- **Minimum TLS Version**: 1.2 (1.3 preferred)
- **Cipher Suites**: Modern, AEAD-only (AES-GCM, ChaCha20-Poly1305)
- **Certificate Management**: cert-manager with Let's Encrypt (production), self-signed (dev)

### mTLS (Production)
- Service mesh (Istio/Linkerd) or sidecar proxies
- Automatic certificate rotation
- Peer authentication strict mode

### Network Policies
```yaml
# Example: Order Service only accepts from Gateway and Dispatch
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-ingress
spec:
  podSelector:
    matchLabels:
      app: order-service
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
        - podSelector:
            matchLabels:
              app: dispatch-service
      ports:
        - protocol: TCP
          port: 8081
```

## Data Protection

### Encryption at Rest
- **PostgreSQL**: Transparent Data Encryption (TDE) or volume encryption
- **Redis**: TLS + ACL authentication
- **Kafka**: SSL/SASL for data in transit
- **Secrets**: Kubernetes Secrets (encrypted at rest with KMS)

### Encryption in Transit
- All service-to-service: mTLS or TLS
- Client-to-Gateway: TLS 1.3
- Database connections: SSL mode `verify-full`

### PII Handling
- **Minimization**: Only collect required data
- **Masking**: Phone numbers masked in logs (`+1*****7890`)
- **Deletion**: GDPR-compliant deletion on request
- **Audit**: All PII access logged

## Secrets Management

### Development
- `.env` files (gitignored)
- Docker Compose environment variables
- Keycloak dev realm with known credentials

### Production
- **Kubernetes Secrets**: For service credentials
- **External Secrets Operator**: Sync from Vault/AWS Secrets Manager
- **Keycloak**: Client secrets rotated periodically
- **Database**: Passwords rotated via automation

### Secret Rotation
- Automated rotation for database passwords (monthly)
- JWT signing keys rotated quarterly
- Client secrets rotated on demand

## Audit Logging

### Events Logged
- Authentication attempts (success/failure)
- Authorization decisions
- Delivery state changes
- Driver status changes
- Admin actions (user management, config changes)
- Secret access

### Log Format
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "service": "order-service",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "770e8400-e29b-41d4-a716-446655440002",
  "action": "DELIVERY_CREATED",
  "resource": "delivery",
  "resourceId": "660e8400-e29b-41d4-a716-446655440001",
  "ipAddress": "192.168.1.100",
  "userAgent": "DeliveryApp/1.0",
  "result": "SUCCESS"
}
```

## Security Headers

All HTTP responses include:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=()
```

## Vulnerability Management

### Dependency Scanning
- **Maven**: OWASP Dependency Check (Java services)
- **Go**: `govulncheck` + `nancy` (Go services)
- **Docker**: Trivy scan on every build
- **Schedule**: Daily scans, PR scans

### Patch Management
- Base images updated weekly
- Critical CVEs patched within 24 hours
- Automated PRs for dependency updates (Dependabot)

### Penetration Testing
- Annual third-party pen test
- Quarterly internal security review
- Bug bounty program for external researchers

## Incident Response

### Security Incident Classification
| Severity | Response Time | Examples |
|----------|---------------|----------|
| Critical | 1 hour | Active breach, data exfiltration |
| High | 4 hours | Vulnerability exploitation, auth bypass |
| Medium | 24 hours | Misconfiguration, info disclosure |
| Low | 1 week | Minor policy violation |

### Runbooks
- JWT key compromise: Rotate keys, revoke tokens
- Database breach: Activate encryption, notify users
- DDoS: Enable WAF, scale gateway
- Insider threat: Revoke access, audit logs

## Compliance

### Standards
- **OWASP Top 10**: Addressed in code review checklist
- **NIST CSF**: Framework alignment documented
- **GDPR**: Data subject rights implemented
- **SOC 2 Type II**: Controls documented

### Certifications
- Annual SOC 2 audit
- PCI DSS not applicable (no payment processing)
- ISO 27001 alignment in progress