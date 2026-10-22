// API Types based on OpenAPI contracts

export type DeliveryStatus =
  | 'CREATED'
  | 'ASSIGNING'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export type DriverStatus = 'OFFLINE' | 'AVAILABLE' | 'RESERVED' | 'BUSY';

export type VehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE' | 'VAN' | 'TRUCK';

export type TrafficLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type WeatherCondition = 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Delivery {
  id: string;
  customerId: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  packageType: string;
  packageWeight: number;
  status: DeliveryStatus;
  driverId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryRequest {
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  packageType: string;
  packageWeight: number;
}

export interface CancelDeliveryRequest {
  reason: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicleType: VehicleType;
  licensePlate?: string;
  status: DriverStatus;
  currentLatitude?: number;
  currentLongitude?: number;
  lastLocationUpdate?: string;
  rating?: number;
  totalDeliveries?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  email?: string;
  vehicleType: VehicleType;
  licensePlate?: string;
}

export interface UpdateStatusRequest {
  status: DriverStatus;
}

export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

export interface LocationResponse {
  driverId: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface ETAPredictionRequest {
  distance: number;
  driverDistance: number;
  averageSpeed: number;
  trafficLevel: TrafficLevel;
  packageWeight: number;
}

export interface ETAPredictionResponse {
  deliveryId: string;
  etaMinutes: number;
  confidence: number;
}

export interface RiskAnalysisRequest {
  driverDistance: number;
  trafficLevel: TrafficLevel;
  packageWeight: number;
  weatherCondition?: WeatherCondition;
}

export interface RiskAnalysisResponse {
  deliveryId: string;
  risk: RiskLevel;
  reasons: string[];
}

export interface AssistantRequest {
  question: string;
  context?: Record<string, unknown>;
}

export interface AssistantResponse {
  answer: string;
}

export interface DriversListResponse {
  drivers: Driver[];
  limit: number;
  offset: number;
}

export interface ErrorResponse {
  traceId?: string;
  timestamp?: string;
  status?: number;
  title?: string;
  detail?: string;
  instance?: string;
  error?: string;
}

// ---- Dispatch types ----
export type DispatchEventType =
  | 'ASSIGNED'
  | 'DISPATCH_STARTED'
  | 'SAGA_COMPLETED'
  | 'SAGA_FAILED'
  | 'RETRY';

export interface DispatchEvent {
  id: string;
  type: DispatchEventType;
  deliveryId: string;
  driverId?: string;
  message: string;
  timestamp: string;
}

export interface DispatchStats {
  started: number;
  assigned: number;
  completed: number;
  failed: number;
  retried: number;
  successRate: number;
}

// ---- Notification types ----
export type NotificationType = 'delivery' | 'driver' | 'system' | 'alert';

/**
 * Frontend-facing notification shape (used throughout the UI).
 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
}

/**
 * Raw shape returned by the notification-service backend.
 * Fields map to the Java NotificationResponse record.
 */
export interface BackendNotificationResponse {
  id: string;
  deliveryId?: string;
  recipientType?: string;
  recipientId?: string;
  channel?: string;       // EMAIL | SMS | PUSH | IN_APP
  subject?: string;
  body?: string;
  templateName?: string;
  status?: string;        // PENDING | SENT | FAILED
  errorMessage?: string;
  sentAt?: string;
  retryCount?: number;
  createdAt: string;
}

// ---- Frontend-only types ----
export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface DashboardStats {
  totalDeliveries: number;
  activeDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  availableDrivers: number;
  totalDrivers: number;
  avgDeliveryTime: number;
}
