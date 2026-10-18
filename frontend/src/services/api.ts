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
export const notificationApi = {
  list: (page = 0, size = 50) =>
    api.get<PageResponse<NotificationItem>>('/api/v1/notifications', {
      params: { page, size },
    }),

  markRead: (id: string) =>
    api.patch<{ message: string }>(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    api.post('/api/v1/notifications/read-all'),

  dismiss: (id: string) =>
    api.delete(`/api/v1/notifications/${id}`),
};

// ---- Auth (Keycloak) ----
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/realms/deliveryhub/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'delivery-client',
        username,
        password,
      }),
      {
        baseURL: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8090',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    ),
};
