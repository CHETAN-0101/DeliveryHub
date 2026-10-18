import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const createDeliveryDuration = new Trend('create_delivery_duration');
const getDeliveryDuration = new Trend('get_delivery_duration');
const listDeliveriesDuration = new Trend('list_deliveries_duration');
const pickupDuration = new Trend('pickup_delivery_duration');
const startDuration = new Trend('start_delivery_duration');
const completeDuration = new Trend('complete_delivery_duration');
const requestsTotal = new Counter('requests_total');

// Test configuration
export const options = {
  scenarios: {
    // Ramp-up phase
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp to 10 VUs
        { duration: '1m', target: 50 },    // Ramp to 50 VUs
        { duration: '2m', target: 100 },   // Ramp to 100 VUs
        { duration: '5m', target: 100 },   // Sustain 100 VUs
        { duration: '2m', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
    // Spike test
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '10s', target: 200 },  // Spike
        { duration: '30s', target: 200 },
        { duration: '10s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '10s', target: 0 },
      ],
      startTime: '10m',  // Run after ramp-up
    },
    // Soak test
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
      startTime: '13m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
    login_duration: ['p(95)<1000'],
    create_delivery_duration: ['p(95)<800'],
    get_delivery_duration: ['p(95)<300'],
    list_deliveries_duration: ['p(95)<400'],
    pickup_delivery_duration: ['p(95)<500'],
    start_delivery_duration: ['p(95)<500'],
    complete_delivery_duration: ['p(95)<500'],
  },
};

// Base URL - can be overridden via env
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8090';

// Test data
const CUSTOMERS = Array.from({ length: 50 }, (_, i) => ({
  username: `customer${i + 1}`,
  password: 'password',
}));

const DRIVERS = Array.from({ length: 20 }, (_, i) => ({
  username: `driver${i + 1}`,
  password: 'password',
}));

const DISPATCHERS = Array.from({ length: 10 }, (_, i) => ({
  username: `dispatcher${i + 1}`,
  password: 'password',
}));

// Helper: Get random item from array
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: Generate random coordinates around NYC
function randomNYCCoords() {
  return {
    lat: 40.7 + Math.random() * 0.1,
    lon: -74.0 + Math.random() * 0.1,
  };
}

// Helper: Login and return token
function login(user) {
  const start = new Date();
  const res = http.post(`${KEYCLOAK_URL}/realms/deliveryhub/protocol/openid-connect/token`,
    `grant_type=password&client_id=delivery-client&username=${user.username}&password=${user.password}`,
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  loginDuration.add(new Date() - start);
  
  check(res, { 'login success': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
  
  if (res.status === 200) {
    return res.json('access_token');
  }
  return null;
}

// Helper: Authenticated request
function authRequest(method, url, token, body = null, params = {}) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...params.headers,
  };
  
  const start = new Date();
  let res;
  switch (method) {
    case 'GET':
      res = http.get(`${BASE_URL}${url}`, { headers, ...params });
      break;
    case 'POST':
      res = http.post(`${BASE_URL}${url}`, JSON.stringify(body), { headers, ...params });
      break;
    case 'PATCH':
      res = http.patch(`${BASE_URL}${url}`, JSON.stringify(body), { headers, ...params });
      break;
    case 'DELETE':
      res = http.del(`${BASE_URL}${url}`, null, { headers, ...params });
      break;
  }
  requestsTotal.add(1);
  return { res, duration: new Date() - start };
}

// Main test function
export default function () {
  // Pick random user roles
  const customer = randomItem(CUSTOMERS);
  const driver = randomItem(DRIVERS);
  const dispatcher = randomItem(DISPATCHERS);

  // Login as customer
  const customerToken = login(customer);
  if (!customerToken) return;
  sleep(0.5);

  // Login as driver
  const driverToken = login(driver);
  if (!driverToken) return;
  sleep(0.5);

  // Login as dispatcher
  const dispatcherToken = login(dispatcher);
  if (!dispatcherToken) return;
  sleep(0.5);

  // ============ SCENARIO 1: Create Delivery ============
  const pickup = randomNYCCoords();
  const dropoff = randomNYCCoords();
  
  let createRes = authRequest('POST', '/api/v1/deliveries', customerToken, {
    pickupAddress: `Pickup ${Math.random()}`,
    pickupLatitude: pickup.lat,
    pickupLongitude: pickup.lon,
    dropoffAddress: `Dropoff ${Math.random()}`,
    dropoffLatitude: dropoff.lat,
    dropoffLongitude: dropoff.lon,
    packageType: ['DOCUMENTS', 'FOOD', 'ELECTRONICS', 'CLOTHING'][Math.floor(Math.random() * 4)],
    packageWeight: Math.random() * 5 + 0.1,
  }, { headers: { 'Idempotency-Key': `test-${Date.now()}-${Math.random()}` } });
  
  createDeliveryDuration.add(createRes.duration);
  check(createRes.res, { 'create delivery 201': (r) => r.status === 201 });
  errorRate.add(createRes.res.status !== 201);
  
  let deliveryId = null;
  if (createRes.res.status === 201) {
    deliveryId = createRes.res.json('id');
  }
  sleep(0.5);

  // ============ SCENARIO 2: Dispatcher assigns driver ============
  if (deliveryId && dispatcherToken) {
    // Create a driver first
    const driverRes = authRequest('POST', '/api/v1/drivers', dispatcherToken, {
      name: `Test Driver ${Date.now()}`,
      phone: `+1555${Math.floor(Math.random() * 10000000)}`,
      vehicleType: 'MOTORCYCLE',
    });
    check(driverRes.res, { 'create driver 201': (r) => r.status === 201 });
    
    let driverId = null;
    if (driverRes.res.status === 201) {
      driverId = driverRes.res.json('id');
      // Set driver available
      authRequest('PATCH', `/api/v1/drivers/${driverId}/status`, dispatcherToken, { status: 'AVAILABLE' });
      // Set driver location near pickup
      authRequest('POST', `/api/v1/drivers/${driverId}/location`, dispatcherToken, { 
        latitude: pickup.lat + 0.01, 
        longitude: pickup.lon + 0.01 
      });
      
      // Assign driver (this would be done by dispatch service in real flow)
      // For test, we simulate by calling the assign endpoint if it exists
      sleep(1);
    }
  }

  // ============ SCENARIO 3: Get Delivery ============
  if (deliveryId) {
    let getRes = authRequest('GET', `/api/v1/deliveries/${deliveryId}`, customerToken);
    getDeliveryDuration.add(getRes.duration);
    check(getRes.res, { 'get delivery 200': (r) => r.status === 200 });
    errorRate.add(getRes.res.status !== 200);
    sleep(0.3);
  }

  // ============ SCENARIO 4: List Deliveries ============
  let listRes = authRequest('GET', '/api/v1/deliveries?page=0&size=20', customerToken);
  listDeliveriesDuration.add(listRes.duration);
  check(listRes.res, { 'list deliveries 200': (r) => r.status === 200 });
  errorRate.add(listRes.res.status !== 200);
  sleep(0.3);

  // ============ SCENARIO 5: Driver picks up ============
  if (deliveryId && driverToken) {
    let pickupRes = authRequest('POST', `/api/v1/deliveries/${deliveryId}/pickup`, driverToken);
    pickupDuration.add(pickupRes.duration);
    check(pickupRes.res, { 'pickup 200': (r) => r.status === 200 });
    errorRate.add(pickupRes.res.status !== 200);
    sleep(1);
  }

  // ============ SCENARIO 6: Driver starts delivery ============
  if (deliveryId && driverToken) {
    let startRes = authRequest('POST', `/api/v1/deliveries/${deliveryId}/start`, driverToken);
    startDuration.add(startRes.duration);
    check(startRes.res, { 'start 200': (r) => r.status === 200 });
    errorRate.add(startRes.res.status !== 200);
    sleep(1);
  }

  // ============ SCENARIO 7: Driver completes delivery ============
  if (deliveryId && driverToken) {
    let completeRes = authRequest('POST', `/api/v1/deliveries/${deliveryId}/complete`, driverToken);
    completeDuration.add(completeRes.duration);
    check(completeRes.res, { 'complete 200': (r) => r.status === 200 });
    errorRate.add(completeRes.res.status !== 200);
    sleep(0.5);
  }

  // ============ SCENARIO 8: AI ETA Prediction ============
  if (deliveryId && customerToken) {
    let etaRes = authRequest('POST', `/api/v1/ai/deliveries/${deliveryId}/eta`, customerToken, {
      distance: 5.2,
      driverDistance: 1.5,
      averageSpeed: 25.0,
      trafficLevel: 'MEDIUM',
      packageWeight: 0.5,
    });
    check(etaRes.res, { 'eta 200': (r) => r.status === 200 });
    errorRate.add(etaRes.res.status !== 200);
    sleep(0.3);
  }

  // ============ SCENARIO 9: AI Risk Analysis ============
  if (deliveryId && customerToken) {
    let riskRes = authRequest('POST', `/api/v1/ai/deliveries/${deliveryId}/risk`, customerToken, {
      driverDistance: 1.5,
      trafficLevel: 'MEDIUM',
      packageWeight: 0.5,
      weatherCondition: 'CLEAR',
    });
    check(riskRes.res, { 'risk 200': (r) => r.status === 200 });
    errorRate.add(riskRes.res.status !== 200);
    sleep(0.3);
  }

  // ============ SCENARIO 10: AI Assistant ============
  if (customerToken) {
    let assistantRes = authRequest('POST', '/api/v1/ai/assistant', customerToken, {
      question: 'What is the status of my delivery?',
    });
    check(assistantRes.res, { 'assistant 200': (r) => r.status === 200 });
    errorRate.add(assistantRes.res.status !== 200);
    sleep(0.3);
  }

  // ============ SCENARIO 11: Notifications ============
  if (customerToken) {
    let notifRes = authRequest('GET', '/api/v1/notifications?page=0&size=20', customerToken);
    check(notifRes.res, { 'notifications 200': (r) => r.status === 200 });
    errorRate.add(notifRes.res.status !== 200);
    sleep(0.3);
  }

  // ============ SCENARIO 12: Cancel Delivery (for some) ============
  if (deliveryId && Math.random() < 0.1 && customerToken) {
    let cancelRes = authRequest('POST', `/api/v1/deliveries/${deliveryId}/cancel`, customerToken, {
      reason: 'Test cancellation',
    });
    check(cancelRes.res, { 'cancel 200': (r) => r.status === 200 });
    errorRate.add(cancelRes.res.status !== 200);
  }

  sleep(Math.random() * 2 + 1); // Think time 1-3s
}

// Teardown
export function teardown(data) {
  console.log('Load test completed');
}