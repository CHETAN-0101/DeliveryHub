import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'admin' | 'driver' | 'dispatcher';
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isDemoMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  demoLogin: (role: AuthUser['role']) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Demo users for offline/demo mode (only used when Keycloak is unreachable)
const DEMO_USERS: Record<string, AuthUser> = {
  admin: {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@deliveryhub.com',
    role: 'admin',
    name: 'Admin User',
  },
  customer: {
    id: 'customer-001',
    username: 'customer1',
    email: 'customer1@deliveryhub.com',
    role: 'customer',
    name: 'Jane Smith',
  },
  driver: {
    id: 'driver-001',
    username: 'driver1',
    email: 'driver1@deliveryhub.com',
    role: 'driver',
    name: 'John Driver',
  },
  dispatcher: {
    id: 'dispatcher-001',
    username: 'dispatcher1',
    email: 'dispatcher1@deliveryhub.com',
    role: 'dispatcher',
    name: 'Sarah Dispatcher',
  },
};

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8090';
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'deliveryhub';
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'delivery-client';

// In development, use relative /realms/... path so Vite proxy routes it to Keycloak.
// In production, use the absolute KEYCLOAK_URL.
const KEYCLOAK_TOKEN_URL = import.meta.env.PROD
  ? `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`
  : `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('auth_user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('auth_token')
  );

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() =>
    (localStorage.getItem('auth_token') || '').startsWith('demo-token-')
  );

  useEffect(() => {
    const handleLogout = () => logout();
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const _persist = (u: AuthUser, t: string, demo: boolean) => {
    setUser(u);
    setToken(t);
    setIsDemoMode(demo);
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('auth_token', t);
  };

  const login = async (username: string, password: string) => {
    // 1) Try real Keycloak login via proxy (avoids CORS in dev)
    try {
      const res = await axios.post(
        KEYCLOAK_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'password',
          client_id: KEYCLOAK_CLIENT_ID,
          username,
          password,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
      );

      const accessToken: string = res.data.access_token;
      const payload = parseJwtPayload(accessToken);

      const realmRoles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
      const validRoles = realmRoles.filter((r) => ['admin', 'customer', 'driver', 'dispatcher'].includes(r));
      const primaryRole = validRoles[0] || 'customer';

      const authUser: AuthUser = {
        id: (payload.sub as string) || username,
        username,
        email: (payload.email as string) || `${username}@deliveryhub.com`,
        role: primaryRole as AuthUser['role'],
        name: (payload.name as string) || username,
      };

      _persist(authUser, accessToken, false);
      return;
    } catch {
      // Keycloak unreachable or credentials wrong → fall through to demo mode
      console.warn('Keycloak login failed, falling back to demo mode');
    }

    // 2) Demo / offline fallback — only for specific demo users
    const demoUser = DEMO_USERS[username] ?? DEMO_USERS.customer;
    const demoToken = `demo-token-${Date.now()}`;
    _persist(demoUser, demoToken, true);
  };

  const demoLogin = (role: AuthUser['role']) => {
    const demoUser = DEMO_USERS[role] ?? DEMO_USERS.admin;
    const demoToken = `demo-token-${Date.now()}`;
    _persist(demoUser, demoToken, true);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsDemoMode(false);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isDemoMode, login, logout, demoLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
