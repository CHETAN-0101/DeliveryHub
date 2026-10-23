import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock } from 'lucide-react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Array<AuthUser['role']>;
}

interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'admin' | 'driver' | 'dispatcher';
  name: string;
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          padding: 32,
        }}
      >
        <div
          style={{
            maxWidth: 400,
            textAlign: 'center',
            background: 'var(--bg-card)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-xl)',
            padding: '48px 32px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 28,
            }}
          >
            <Lock size={32} color="#fff" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Access Denied
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            You don't have permission to access this page. This area requires one of the following roles:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
            {allowedRoles.map((role) => (
              <span
                key={role}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--bg-border)',
                  color: 'var(--text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {role}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            Your current role: <strong style={{ textTransform: 'capitalize' }}>{user?.role || 'unknown'}</strong>
          </p>
          <button
            onClick={() => window.history.back()}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Need to import ArrowLeft
import { ArrowLeft } from 'lucide-react';