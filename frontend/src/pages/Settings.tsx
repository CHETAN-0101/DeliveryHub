import { Server, Key, Bell, Sliders, Info } from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  const SECTIONS = [
    {
      icon: <Server size={16} />,
      title: 'Service Endpoints',
      description: 'Backend service URLs for API calls',
      items: [
        { label: 'API Gateway', value: 'http://localhost:8080', id: 'cfg-gateway' },
        { label: 'Order Service', value: 'http://localhost:8081', id: 'cfg-order' },
        { label: 'Driver Service', value: 'http://localhost:8082', id: 'cfg-driver' },
        { label: 'Dispatch Service', value: 'http://localhost:8083', id: 'cfg-dispatch' },
        { label: 'AI Service', value: 'http://localhost:8085', id: 'cfg-ai' },
      ],
    },
    {
      icon: <Key size={16} />,
      title: 'Authentication',
      description: 'Keycloak OIDC configuration',
      items: [
        { label: 'Keycloak URL', value: 'http://localhost:8090', id: 'cfg-keycloak' },
        { label: 'Realm', value: 'deliveryhub', id: 'cfg-realm' },
        { label: 'Client ID', value: 'delivery-client', id: 'cfg-client' },
      ],
    },
    {
      icon: <Sliders size={16} />,
      title: 'Rate Limiting',
      description: 'API Gateway rate limit configuration',
      items: [
        { label: 'RPS Limit', value: '100 req/s', id: 'cfg-rps' },
        { label: 'Burst', value: '200 req', id: 'cfg-burst' },
      ],
    },
  ];

  return (
    <div>
      <Header title="Settings" subtitle="Application and service configuration" />
      <div className="page-content">
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Profile Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user?.email}</div>
                <span
                  className="badge"
                  style={{
                    marginTop: 6,
                    background: 'rgba(99,102,241,0.15)',
                    color: 'var(--brand-300)',
                    textTransform: 'capitalize',
                  }}
                >
                  {user?.role}
                </span>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Display Name</label>
                <input id="cfg-name" className="input" defaultValue={user?.name} />
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input id="cfg-email" className="input" defaultValue={user?.email} type="email" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button id="btn-save-profile" className="btn btn-primary">Save Changes</button>
            </div>
          </div>

          {/* Service Config Sections */}
          {SECTIONS.map((section) => (
            <div key={section.title} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ color: 'var(--brand-400)' }}>{section.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{section.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{section.description}</div>
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {section.items.map((item) => (
                  <div key={item.id} className="input-group">
                    <label className="input-label">{item.label}</label>
                    <input id={item.id} className="input" defaultValue={item.value} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Notifications Settings */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ color: 'var(--brand-400)' }}><Bell size={16} /></div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Notification Preferences</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Choose what alerts to receive</div>
              </div>
            </div>

            {[
              { id: 'notif-delivery-create', label: 'New delivery created', enabled: true },
              { id: 'notif-delivery-complete', label: 'Delivery completed', enabled: true },
              { id: 'notif-delivery-cancel', label: 'Delivery cancelled', enabled: true },
              { id: 'notif-driver-offline', label: 'Driver goes offline unexpectedly', enabled: true },
              { id: 'notif-saga-failed', label: 'Dispatch saga failure', enabled: true },
              { id: 'notif-high-risk', label: 'High-risk delivery flagged', enabled: false },
            ].map((pref) => (
              <div
                key={pref.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--bg-border)',
                }}
              >
                <label htmlFor={pref.id} style={{ fontSize: 13, cursor: 'pointer' }}>{pref.label}</label>
                <input id={pref.id} type="checkbox" defaultChecked={pref.enabled} style={{ width: 16, height: 16, accentColor: 'var(--brand-500)', cursor: 'pointer' }} />
              </div>
            ))}
          </div>

          {/* System Info */}
          <div className="card" style={{ background: 'rgba(6,182,212,0.05)', borderColor: 'rgba(6,182,212,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Info size={16} color="var(--accent-cyan)" />
              <div style={{ fontWeight: 600, fontSize: 14 }}>System Information</div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Frontend Version', value: '1.0.0' },
                { label: 'API Version', value: 'v1' },
                { label: 'UI Framework', value: 'React 18 + Vite' },
                { label: 'Auth', value: 'Keycloak 24' },
                { label: 'Messaging', value: 'Apache Kafka 3.6' },
                { label: 'Database', value: 'PostgreSQL 16' },
              ].map((s) => (
                <div key={s.label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
