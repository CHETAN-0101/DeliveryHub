import { useState } from 'react';
import { Zap, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch {
      setError('Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorations */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '10%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeIn 0.4s ease' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              boxShadow: 'var(--shadow-glow)',
              animation: 'pulse-glow 3s ease infinite',
            }}
          >
            <Zap size={28} color="#fff" />
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--brand-300) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 6,
            }}
          >
            DeliveryHub
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            AI-Powered Delivery Management Platform
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px 32px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Sign in</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
            Use the demo accounts below, or connect to your Keycloak instance
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label className="input-label">Username</label>
                <input
                  id="login-username"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    id="btn-toggle-password"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent-rose)' }}>
                  {error}
                </div>
              )}

              <button
                id="btn-login-submit"
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: 4 }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : null}
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRight size={16} />}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--bg-border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick Demo Access</span>
            <div style={{ flex: 1, height: 1, background: 'var(--bg-border)' }} />
          </div>

          {/* Demo buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { role: 'admin' as const, label: '👑 Admin', desc: 'Full access' },
              { role: 'dispatcher' as const, label: '📋 Dispatcher', desc: 'Manage assignments' },
              { role: 'customer' as const, label: '👤 Customer', desc: 'Order deliveries' },
              { role: 'driver' as const, label: '🚗 Driver', desc: 'Manage status' },
            ].map((d) => (
              <button
                key={d.role}
                id={`btn-demo-${d.role}`}
                onClick={() => demoLogin(d.role)}
                className="btn btn-secondary"
                style={{
                  flexDirection: 'column',
                  padding: '12px 8px',
                  gap: 4,
                  height: 'auto',
                }}
              >
                <span style={{ fontSize: 16 }}>{d.label.split(' ')[0]}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{d.label.split(' ').slice(1).join(' ')}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
          For Keycloak auth: configure{' '}
          <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>
            VITE_KEYCLOAK_URL
          </code>{' '}
          in your .env
        </p>
      </div>
    </div>
  );
}
