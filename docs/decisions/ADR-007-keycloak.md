# ADR-007: Keycloak for OIDC/JWT Authentication

## Status
Accepted

## Context
DeliveryHub needs a standard, secure, and feature-rich authentication system supporting:
- Multiple user types (customers, drivers, dispatchers, admins)
- Role-based access control (RBAC)
- Token-based stateless authentication
- Integration with Spring Security (Java) and Go middleware
- Industry-standard protocols (OIDC/OAuth2/JWT)

## Decision
Use **Keycloak 24+** as the Identity Provider with:
- **Protocol**: OpenID Connect (OIDC) / OAuth 2.0
- **Tokens**: JWT (RS256) with JWKS endpoint for validation
- **Realm**: `deliveryhub` with custom roles and clients
- **Client**: `delivery-client` (confidential) for all services

## Keycloak Configuration

### Realm: `deliveryhub`
```json
{
  "realm": "deliveryhub",
  "accessTokenLifespan": 3600,           // 1 hour
  "ssoSessionIdleTimeout": 1800,         // 30 min
  "ssoSessionMaxLifespan": 36000,        // 10 hours
  "offlineSessionIdleTimeout": 2592000   // 30 days
}
```

### Roles
| Role | Description | Composite |
|------|-------------|-----------|
| `customer` | End users creating deliveries | No |
| `driver` | Delivery drivers | No |
| `dispatcher` | Operations staff | No |
| `admin` | System administrators | Yes (customer, driver, dispatcher) |

### Client: `delivery-client`
```json
{
  "clientId": "delivery-client",
  "secret": "delivery-secret",
  "standardFlowEnabled": true,      // Authorization Code
  "directAccessGrantsEnabled": true, // Resource Owner Password
  "serviceAccountsEnabled": true,    // Client Credentials
  "authorizationServicesEnabled": true,
  "protocolMappers": [
    {
      "name": "roles",
      "protocolMapper": "oidc-usermodel-realm-role-mapper",
      "config": {
        "claim.name": "roles",
        "access.token.claim": "true",
        "id.token.claim": "true"
      }
    },
    {
      "name": "username",
      "protocolMapper": "oidc-usermodel-property-mapper",
      "config": {
        "claim.name": "preferred_username",
        "user.attribute": "username"
      }
    }
  ]
}
```

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
    "delivery-client": { "roles": [] }
  },
  "exp": 1705315800,
  "iat": 1705312200,
  "iss": "https://keycloak.example.com/realms/deliveryhub",
  "aud": "delivery-client"
}
```

## Integration

### API Gateway (Go)
```go
// Validate JWT using JWKS from Keycloak
func (m *AuthMiddleware) Validate() gin.HandlerFunc {
    return func(c *gin.Context) {
        tokenString := extractBearerToken(c)
        
        // In production: fetch JWKS, validate signature, check exp/iss/aud
        // Dev mode: parse unverified (for simplicity)
        token, _ := jwt.ParseUnverified(tokenString, &JWTClaims{})
        claims := token.Claims.(*JWTClaims)
        
        if claims.ExpiresAt.Time.Before(time.Now()) {
            c.AbortWithStatusJSON(401, gin.H{"error": "token expired"})
            return
        }
        
        c.Set("user_id", claims.Subject)
        c.Set("roles", claims.Roles)
        c.Set("username", claims.PreferredUsername)
        c.Next()
    }
}

// Role-based authorization
func (m *AuthMiddleware) RequireRoles(roles ...string) gin.HandlerFunc {
    return func(c *gin.Context) {
        userRoles, _ := c.Get("roles")
        // Check intersection
    }
}
```

### Order Service (Java/Spring Boot)
```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://keycloak:8080/realms/deliveryhub
          jwk-set-uri: http://keycloak:8080/realms/deliveryhub/protocol/openid-connect/certs
```

```java
@PreAuthorize("hasRole('CUSTOMER') and @deliverySecurity.isOwner(#id, authentication)")
public DeliveryResponse getDelivery(UUID id, Jwt jwt) { ... }
```

### Driver Service (Go)
```go
// Same validation as Gateway, plus service-specific authorization
func (h *DriverHandler) UpdateDriverLocation(c *gin.Context) {
    driverID := c.Param("id")
    userID := getUserID(c) // From JWT "sub"
    
    // Driver can only update own location
    if !isOwner(driverID, userID) && !hasRole(c, "dispatcher", "admin") {
        c.AbortWithStatusJSON(403, gin.H{"error": "forbidden"})
        return
    }
    // ...
}
```

## Alternatives Considered

### Custom JWT Implementation
**Pros**: Full control, no external dependency
**Cons**: 
- Don't roll your own crypto/auth
- User management, password reset, MFA, SSO = massive effort
- No admin UI, audit logs, compliance features

### Auth0 / AWS Cognito / Clerk
**Pros**: Fully managed, scalable
**Cons**: 
- Vendor lock-in
- Cost at scale ($$$)
- Limited customization vs self-hosted
- Data residency concerns

### OAuth2 Proxy + LDAP/AD
**Pros**: Simple gateway-level auth
**Cons**: 
- Only gateway protection, no service-level auth
- No user management UI
- Limited RBAC, token customization

### Session/Cookie Based
**Pros**: Simple for traditional web apps
**Cons**: 
- Not stateless (breaks horizontal scaling)
- CSRF vulnerabilities
- Mobile/API unfriendly
- No standard token format

## Consequences

### Positive
- **Standards Compliant**: OIDC/OAuth2/JWT - interoperable
- **Feature Rich**: MFA, social login, user federation, brute force protection
- **Admin UI**: User management, role assignment, session revocation
- **Audit**: Login events, admin actions logged
- **Multi-tenancy**: Realms for isolation
- **Cost**: Open source, self-hosted, no per-user fees

### Negative
- **Operational Overhead**: Another stateful service to run/monitor
- **Complexity**: Many configuration options, steep learning curve
- **Resource Usage**: Java-based, ~512MB+ RAM
- **Startup Time**: 30-60s for full initialization
- **Upgrades**: Major versions can have breaking changes

## Token Validation Strategy

### Gateway (Validation + Enrichment)
1. Extract `Authorization: Bearer <token>`
2. Validate signature using Keycloak JWKS (cached)
3. Check `exp`, `iss`, `aud`, `nbf`
4. Extract `sub`, `roles`, `preferred_username`
5. Set headers: `X-User-ID`, `X-User-Roles`, `X-Username`
6. Forward to downstream services

### Services (Trust but Verify)
- **Gateway-validated**: Services trust Gateway headers for performance
- **Defense in Depth**: Services also validate JWT for direct calls
- **Authorization**: Services check roles + resource ownership

### JWKS Caching
```go
// Cache JWKS for 1 hour (Keycloak rotates keys periodically)
jwksCache := NewJWKSCache(keycloakURL + "/realms/deliveryhub/protocol/openid-connect/certs", 1*time.Hour)
```

## Security Features Enabled
- **Brute Force Protection**: 30 failures → 15min lockout
- **Password Policies**: Min length, complexity, history
- **MFA**: TOTP, WebAuthn (configurable per role)
- **Session Management**: SSO, idle/max timeouts
- **Event Logging**: Login, admin actions to Kafka/Elastic

## Development vs Production

### Development (Docker Compose)
```yaml
keycloak:
  image: quay.io/keycloak/keycloak:24.0
  command: start-dev --import-realm
  environment:
    KC_BOOTSTRAP_ADMIN_USERNAME: admin
    KC_BOOTSTRAP_ADMIN_PASSWORD: admin
  volumes:
    - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json
```

### Production
- **HA**: Multiple Keycloak nodes with shared DB (PostgreSQL)
- **TLS**: HTTPS only, HSTS, secure cookies
- **Database**: External PostgreSQL (not embedded H2)
- **Secrets**: Client secrets in Vault/K8s Secrets
- **Backups**: Realm export, DB backups
- **Monitoring**: Health endpoint, metrics, alerting

## Related ADRs
- ADR-006: REST vs gRPC (JWT at Gateway)
- ADR-009: Database-per-Service (Keycloak separate DB)
- ADR-001: Microservices (auth as cross-cutting concern)