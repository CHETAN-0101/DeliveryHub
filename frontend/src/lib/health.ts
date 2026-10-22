/**
 * health.ts — real-time backend health checker
 * Pings each microservice endpoint and returns status.
 */
import axios from 'axios';

// In development (Vite), use relative paths so the Vite proxy forwards requests
// to localhost:8080 (gateway). In production, use the env var.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL || '')
  : '';

export interface ServiceHealth {
  label: string;
  url: string;
  status: 'up' | 'down' | 'checking';
  latencyMs?: number;
}

const SERVICES = [
  { label: 'API Gateway',          url: `${API_BASE}/health` },
  // These authenticated endpoints return 401 if auth is required — treated as "up" (reachable)
  { label: 'Order Service',        url: `${API_BASE}/api/v1/deliveries?page=0&size=1` },
  { label: 'Driver Service',       url: `${API_BASE}/api/v1/drivers?limit=1` },
  { label: 'Dispatch Service',     url: `${API_BASE}/api/v1/dispatch/events?limit=1` },
  // AI service exposes /api/v1/ai/health (no auth required)
  { label: 'AI Service',           url: `${API_BASE}/api/v1/ai/health` },
  { label: 'Notification Service', url: `${API_BASE}/api/v1/notifications?page=0&size=1` },
  // Keycloak OIDC discovery endpoint — routed via Vite proxy (/realms/* → Keycloak:8090)
  { label: 'Keycloak',             url: `/realms/deliveryhub/.well-known/openid-configuration` },
];

async function pingService(svc: { label: string; url: string }): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await axios.get(svc.url, { timeout: 4000 });
    return { label: svc.label, url: svc.url, status: 'up', latencyMs: Date.now() - start };
  } catch (e: unknown) {
    // 401/403 means service is UP (auth required) — not a connectivity failure
    const status = (e as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403 || status === 404) {
      return { label: svc.label, url: svc.url, status: 'up', latencyMs: Date.now() - start };
    }
    return { label: svc.label, url: svc.url, status: 'down' };
  }
}

export async function checkAllServices(): Promise<ServiceHealth[]> {
  return Promise.all(SERVICES.map(pingService));
}

export async function checkGateway(): Promise<boolean> {
  const result = await pingService(SERVICES[0]);
  return result.status === 'up';
}
