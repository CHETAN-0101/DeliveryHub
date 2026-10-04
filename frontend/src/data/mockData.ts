import type {
  Delivery,
  DeliveryStatus,
  Driver,
  DriverStatus,
  VehicleType,
  DashboardStats,
} from '../types/api';

// ---- Mock Data Generators ----
const PICKUP_ADDRESSES = [
  '123 Main St, New York, NY',
  '789 Oak Ave, Brooklyn, NY',
  '456 Park Blvd, Queens, NY',
  '321 River Rd, Manhattan, NY',
  '654 5th Ave, New York, NY',
];

const DROPOFF_ADDRESSES = [
  '456 Broadway, New York, NY',
  '101 Times Sq, New York, NY',
  '222 Central Park W, NY',
  '99 Wall St, New York, NY',
  '1600 Broadway, New York, NY',
];

const PACKAGE_TYPES = ['DOCUMENTS', 'FRAGILE', 'FOOD', 'ELECTRONICS', 'CLOTHING', 'MEDICAL'];

const DRIVER_NAMES = [
  'Marcus Johnson', 'Sarah Lee', 'Carlos Rivera', 'Priya Patel',
  'David Kim', 'Emma Wilson', 'Ali Hassan', 'Sophia Chen',
  'James Brown', 'Olga Morozova',
];

const VEHICLE_TYPES: VehicleType[] = ['MOTORCYCLE', 'CAR', 'BICYCLE', 'VAN', 'TRUCK'];

const STATUSES: DeliveryStatus[] = [
  'CREATED', 'ASSIGNING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED',
];

const DRIVER_STATUSES: DriverStatus[] = ['OFFLINE', 'AVAILABLE', 'RESERVED', 'BUSY'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(daysAgo = 30): string {
  const now = Date.now();
  const past = now - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past)).toISOString();
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---- Generate Mock Deliveries ----
export function generateMockDeliveries(count = 50): Delivery[] {
  return Array.from({ length: count }, (_, i) => {
    const createdAt = randomDate(30);
    return {
      id: uuid(),
      customerId: `cust-${String(i % 10 + 1).padStart(3, '0')}`,
      pickupAddress: randomItem(PICKUP_ADDRESSES),
      pickupLatitude: randomBetween(40.6, 40.85),
      pickupLongitude: randomBetween(-74.1, -73.9),
      dropoffAddress: randomItem(DROPOFF_ADDRESSES),
      dropoffLatitude: randomBetween(40.6, 40.85),
      dropoffLongitude: randomBetween(-74.1, -73.9),
      packageType: randomItem(PACKAGE_TYPES),
      packageWeight: parseFloat(randomBetween(0.1, 50).toFixed(2)),
      status: randomItem(STATUSES),
      driverId: Math.random() > 0.3 ? uuid() : undefined,
      createdAt,
      updatedAt: new Date(new Date(createdAt).getTime() + randomBetween(0, 3600000)).toISOString(),
    };
  });
}

// ---- Generate Mock Drivers ----
export function generateMockDrivers(count = 20): Driver[] {
  return Array.from({ length: count }, (_, i) => {
    const createdAt = randomDate(90);
    return {
      id: uuid(),
      name: DRIVER_NAMES[i % DRIVER_NAMES.length],
      phone: `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`,
      email: `driver${i + 1}@deliveryhub.com`,
      vehicleType: randomItem(VEHICLE_TYPES),
      licensePlate: `NY-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      status: randomItem(DRIVER_STATUSES),
      currentLatitude: randomBetween(40.6, 40.85),
      currentLongitude: randomBetween(-74.1, -73.9),
      lastLocationUpdate: randomDate(1),
      rating: parseFloat(randomBetween(3.5, 5.0).toFixed(1)),
      totalDeliveries: Math.floor(randomBetween(10, 500)),
      createdAt,
      updatedAt: new Date(new Date(createdAt).getTime() + randomBetween(0, 3600000 * 24)).toISOString(),
    };
  });
}

// ---- Compute Dashboard Stats ----
export function computeStats(deliveries: Delivery[], drivers: Driver[]): DashboardStats {
  return {
    totalDeliveries: deliveries.length,
    activeDeliveries: deliveries.filter(
      (d) => !['DELIVERED', 'CANCELLED'].includes(d.status)
    ).length,
    completedDeliveries: deliveries.filter((d) => d.status === 'DELIVERED').length,
    cancelledDeliveries: deliveries.filter((d) => d.status === 'CANCELLED').length,
    availableDrivers: drivers.filter((d) => d.status === 'AVAILABLE').length,
    totalDrivers: drivers.length,
    avgDeliveryTime: 28, // simulated
  };
}

// ---- Get Status History for a delivery ----
export function getStatusHistory(delivery: Delivery) {
  const allStatuses: DeliveryStatus[] = [
    'CREATED', 'ASSIGNING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED',
  ];
  const idx = allStatuses.indexOf(delivery.status);
  if (delivery.status === 'CANCELLED') {
    return [
      { status: 'CREATED', time: delivery.createdAt, done: true },
      { status: 'CANCELLED', time: delivery.updatedAt, done: true },
    ];
  }
  return allStatuses.slice(0, idx + 1).map((s, i) => ({
    status: s,
    time: new Date(
      new Date(delivery.createdAt).getTime() + i * randomBetween(300000, 900000)
    ).toISOString(),
    done: true,
  }));
}

// ---- Delivery chart data (last 7 days) ----
export function getDeliveryChartData(_deliveries: Delivery[]) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, i) => {
    const base = 20 + Math.floor(Math.random() * 30);
    return {
      day,
      delivered: base + i,
      cancelled: Math.floor(Math.random() * 5),
      created: base + i + Math.floor(Math.random() * 10),
    };
  });
}

// ---- Status distribution ----
export function getStatusDistribution(deliveries: Delivery[]) {
  const counts: Record<string, number> = {};
  deliveries.forEach((d) => {
    counts[d.status] = (counts[d.status] || 0) + 1;
  });
  return Object.entries(counts).map(([status, value]) => ({ status, value }));
}

// ---- Vehicle type distribution ----
export function getVehicleDistribution(drivers: Driver[]) {
  const counts: Record<string, number> = {};
  drivers.forEach((d) => {
    counts[d.vehicleType] = (counts[d.vehicleType] || 0) + 1;
  });
  return Object.entries(counts).map(([type, value]) => ({ type, value }));
}
