import api from '../lib/axios';
import type {
  Delivery,
  CreateDeliveryRequest,
  CancelDeliveryRequest,
  PageResponse,
  Driver,
  CreateDriverRequest,
  UpdateStatusRequest,
  UpdateLocationRequest,
  LocationResponse,
  DriversListResponse,
  ETAPredictionRequest,
  ETAPredictionResponse,
  RiskAnalysisRequest,
  RiskAnalysisResponse,
  AssistantRequest,
  AssistantResponse,
  NotificationItem,
  BackendNotificationResponse,
  DispatchStats,
  DispatchEvent,
} from '../types/api';

// ---- Order Service ----
export const orderApi = {
  createDelivery: (data: CreateDeliveryRequest, idempotencyKey?: string) =>
    api.post<Delivery>('/api/v1/deliveries', data, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),

  listDeliveries: (page = 0, size = 20) =>
    api.get<PageResponse<Delivery>>('/api/v1/deliveries', {
      params: { page, size },
    }),

  getDelivery: (id: string) =>
    api.get<Delivery>(`/api/v1/deliveries/${id}`),

  cancelDelivery: (id: string, data: CancelDeliveryRequest) =>
    api.post<Delivery>(`/api/v1/deliveries/${id}/cancel`, data),

  // Driver actions for delivery lifecycle
  pickupDelivery: (id: string) =>
    api.post<Delivery>(`/api/v1/deliveries/${id}/pickup`),

  startDelivery: (id: string) =>
    api.post<Delivery>(`/api/v1/deliveries/${id}/start`),

  completeDelivery: (id: string) =>
    api.post<Delivery>(`/api/v1/deliveries/${id}/complete`),
};

// ---- Driver Service ----
export const driverApi = {
  createDriver: (data: CreateDriverRequest) =>
    api.post<Driver>('/api/v1/drivers', data),

  listDrivers: (limit = 100, offset = 0) =>
    api.get<DriversListResponse>('/api/v1/drivers', {
      params: { limit, offset },
    }),

  getDriver: (id: string) =>
    api.get<Driver>(`/api/v1/drivers/${id}`),

  updateStatus: (id: string, data: UpdateStatusRequest) =>
    api.patch<{ message: string }>(`/api/v1/drivers/${id}/status`, data),

  updateLocation: (id: string, data: UpdateLocationRequest) =>
    api.post(`/api/v1/drivers/${id}/location`, data),

  getLocation: (id: string) =>
    api.get<LocationResponse>(`/api/v1/drivers/${id}/location`),
};

// ---- AI Service ----
export const aiApi = {
  predictETA: (deliveryId: string, data: ETAPredictionRequest) =>
    api.post<ETAPredictionResponse>(`/api/v1/ai/deliveries/${deliveryId}/eta`, data),

  analyzeRisk: (deliveryId: string, data: RiskAnalysisRequest) =>
    api.post<RiskAnalysisResponse>(`/api/v1/ai/deliveries/${deliveryId}/risk`, data),

  askAssistant: (data: AssistantRequest) =>
    api.post<AssistantResponse>('/api/v1/ai/assistant', data),
};

// ---- Dispatch Service ----
export const dispatchApi = {
  getEvents: (limit = 50) =>
    api.get<{ events: DispatchEvent[] }>('/api/v1/dispatch/events', {
      params: { limit },
    }),

  getStats: () =>
    api.get<DispatchStats>('/api/v1/dispatch/stats'),
};

// ---- Notification Service ----

/**
 * Adapter: converts the backend NotificationResponse DTO to the frontend NotificationItem.
 * The backend returns { subject, body, status, channel, createdAt } whereas the UI
 * expects { title, message, type, read, timestamp }.
 */
function adaptNotification(n: BackendNotificationResponse): NotificationItem {
  // Derive a frontend "type" from the templateName or channel
  let type: NotificationItem['type'] = 'system';
  const tmpl = (n.templateName ?? '').toLowerCase();
  const ch   = (n.channel ?? '').toLowerCase();
  if (tmpl.includes('delivery') || tmpl.includes('order')) type = 'delivery';
  else if (tmpl.includes('driver'))                         type = 'driver';
  else if (tmpl.includes('alert') || ch.includes('push'))  type = 'alert';

  // A notification is "read" when its status is SENT (processed) and sentAt is set
  const read = n.status === 'SENT' && !!n.sentAt;

  return {
    id:        String(n.id),
    type,
    title:     n.subject ?? 'Notification',
    message:   n.body ?? '',
    read,
    timestamp: n.createdAt,
  };
}

export const notificationApi = {
  /** Returns a page of notifications adapted to the frontend shape. */
  list: async (page = 0, size = 50) => {
    const res = await api.get<PageResponse<BackendNotificationResponse>>('/api/v1/notifications', {
      params: { page, size },
    });
    // Transform each backend item to the frontend NotificationItem shape
    const adapted: PageResponse<NotificationItem> = {
      ...res.data,
      content: (res.data.content ?? []).map(adaptNotification),
    };
    return { ...res, data: adapted };
  },

  markRead: (id: string) =>
    api.patch<{ message: string }>(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    api.post('/api/v1/notifications/read-all'),

  dismiss: (id: string) =>
    api.delete(`/api/v1/notifications/${id}`),
};

// ---- Auth (Keycloak) ----
// NOTE: Uses the Vite proxy in development (/realms/* → Keycloak).
// In production, set VITE_KEYCLOAK_URL and ensure the production reverse proxy forwards /realms/*.
export const authApi = {
  login: (username: string, password: string) => {
    const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'deliveryhub';
    const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'delivery-client';
    // Use relative URL so Vite dev proxy routes /realms/* to Keycloak.
    // In production builds, this path must also be proxied at the web server level.
    return api.post(
      `/realms/${realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username,
        password,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
  },
};
