import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 10 },    // Baseline
        { duration: '10s', target: 500 },   // Sudden spike to 500 VUs
        { duration: '1m', target: 500 },    // Sustain spike
        { duration: '10s', target: 10 },    // Drop back
        { duration: '2m', target: 10 },     // Recovery
        { duration: '10s', target: 0 },     // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<2000'],  // Allow higher latency during spike
    http_req_failed: ['rate<0.1'],      // Allow up to 10% failures during spike
    errors: ['rate<0.15'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8090';

function login(username, password) {
  const res = http.post(`${KEYCLOAK_URL}/realms/deliveryhub/protocol/openid-connect/token`,
    `grant_type=password&client_id=delivery-client&username=${username}&password=${password}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (res.status === 200) return res.json('access_token');
  return null;
}

function authGet(url, token) {
  return http.get(`${BASE_URL}${url}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

function authPost(url, token, body) {
  return http.post(`${BASE_URL}${url}`, JSON.stringify(body), {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

export default function () {
  // Use a shared test user
  const token = login('customer1', 'password');
  if (!token) return;

  // Mix of read and write operations
  const operations = [
    () => authGet('/api/v1/deliveries?page=0&size=20', token),
    () => authGet('/api/v1/drivers?limit=50', token),
    () => authGet('/api/v1/notifications?page=0&size=20', token),
    () => authGet('/api/v1/dispatch/stats', token),
    () => authGet('/api/v1/ai/deliveries/00000000-0000-0000-0000-000000000000/eta', token),
  ];

  // Execute random operations
  const op = operations[Math.floor(Math.random() * operations.length)];
  const start = new Date();
  const res = op();
  requestDuration.add(new Date() - start);
  
  check(res, { 'status 2xx or 4xx': (r) => r.status < 500 });
  
  sleep(Math.random() * 0.5); // Very short think time for spike
}