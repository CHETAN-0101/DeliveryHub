import axios from 'axios';

// In development, Vite's proxy routes /api/* → localhost:8080 and /realms/* → localhost:8090.
// Setting an absolute baseURL bypasses the Vite proxy and causes CORS errors.
// Use an empty baseURL in dev (via Vite proxy) and the env var in production.
const baseURL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL || '')
  : '';

// Create axios instance with base config
const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export default api;
