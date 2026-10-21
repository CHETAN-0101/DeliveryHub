import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, UserPlus, UserMinus, Cpu, Wifi, WifiOff } from 'lucide-react';
import Header from '../components/Header';
import { useToast } from '../context/ToastContext';

interface SystemUser {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'admin' | 'driver' | 'dispatcher';
  name: string;
  status: 'active' | 'inactive';
  lastLogin: string;
}

interface SystemStats {
  totalUsers: number;
  activeDeliveries: number;
  availableDrivers: number;
  systemHealth: 'healthy' | 'degraded' | 'down';
  services: Array<{ name: string; status: 'up' | 'down'; latency: number }>;
}

const MOCK_USERS: SystemUser[] = [
  { id: 'admin-001', username: 'admin', email: 'admin@deliveryhub.com', role: 'admin', name: 'Admin User', status: 'active', lastLogin: '2024-01-15T10:30:00Z' },
  { id: 'customer-001', username: 'customer1', email: 'customer1@deliveryhub.com', role: 'customer', name: 'Jane Smith', status: 'active', lastLogin: '2024-01-15T09:15:00Z' },
  { id: 'driver-001', username: 'driver1', email: 'driver1@deliveryhub.com', role: 'driver', name: 'John Driver', status: 'active', lastLogin: '2024-01-15T08:00:00Z' },
  { id: 'dispatcher-001', username: 'dispatcher1', email: 'dispatcher1@deliveryhub.com', role: 'dispatcher', name: 'Sarah Dispatcher', status: 'active', lastLogin: '2024-01-15T07:45:00Z' },
  { id: 'customer-002', username: 'customer2', email: 'customer2@deliveryhub.com', role: 'customer', name: 'Bob Wilson', status: 'inactive', lastLogin: '2024-01-10T14:20:00Z' },
  { id: 'driver-002', username: 'driver2', email: 'driver2@deliveryhub.com', role: 'driver', name: 'Mike Johnson', status: 'active', lastLogin: '2024-01-15T06:30:00Z' },
];

const MOCK_SERVICES = [
  { name: 'Order Service', status: 'up' as const, latency: 45 },
  { name: 'Driver Service', status: 'up' as const, latency: 32 },
  { name: 'Dispatch Service', status: 'up' as const, latency: 28 },
  { name: 'Notification Service', status: 'up' as const, latency: 52 },
  { name: 'AI Service', status: 'up' as const, latency: 120 },
  { name: 'API Gateway', status: 'up' as const, latency: 15 },
  { name: 'PostgreSQL (Order)', status: 'up' as const, latency: 8 },
  { name: 'PostgreSQL (Driver)', status: 'up' as const, latency: 7 },
  { name: 'Redis', status: 'up' as const, latency: 2 },
  { name: 'Kafka', status: 'up' as const, latency: 12 },
];

const FEATURE_FLAGS = [
  { featureKey: 'qr', name: 'QR Code Integration', description: 'Enable QR code generation and scanning for deliveries', enabled: false },
  { featureKey: 'tracking', name: 'Real-time Tracking', description: 'Live GPS tracking for drivers', enabled: true },
  { featureKey: 'ai', name: 'AI Predictions', description: 'ETA predictions and risk analysis', enabled: true },
  { featureKey: 'push', name: 'Push Notifications', description: 'Firebase push notifications', enabled: true },
  { featureKey: 'sms', name: 'SMS Notifications', description: 'Twilio SMS delivery updates', enabled: false },
  { featureKey: 'email', name: 'Email Notifications', description: 'SendGrid email delivery updates', enabled: true },
];

export default function AdminPanel() {
  const { addToast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | SystemUser['role']>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [page, setPage] = useState(0);

  const stats: SystemStats = {
    totalUsers: MOCK_USERS.length,
    activeDeliveries: 23,
    availableDrivers: 8,
    systemHealth: 'healthy',
    services: MOCK_SERVICES,
  };

  const PAGE_SIZE = 10;

  const filteredUsers = users
    .filter((u) => roleFilter === 'ALL' || u.role === roleFilter)
    .filter((u) => statusFilter === 'ALL' || u.status === statusFilter)
    .filter((u) =>
      !search ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase())
    );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRoleChange = (userId: string, newRole: SystemUser['role']) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    addToast('success', `User role updated to ${newRole}`);
  };

  const handleStatusToggle = (userId: string) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
    addToast('success', 'User status updated');
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      addToast('success', 'User deleted');
    }
  };

  return (
    <div>
      <Header
        title="Admin Panel"
        subtitle="System administration, user management, and service monitoring"
        onRefresh={() => {}}
        loading={false}
      />
      <div className="page-content">
        {/* System Health Overview */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          <div className="stat-card">
            <div style={{ fontSize: 28, fontWeight: 700, color: stats.systemHealth === 'healthy' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
              {stats.systemHealth === 'healthy' ? '🟢' : '🔴'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              System: {stats.systemHealth.charAt(0).toUpperCase() + stats.systemHealth.slice(1)}
            </div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand-400)' }}>{stats.totalUsers}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Total Users</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-cyan)' }}>{stats.activeDeliveries}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Active Deliveries</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-amber)' }}>{stats.availableDrivers}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Available Drivers</div>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* User Management */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>User Management</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filteredUsers.length} users</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => {}}>
                <UserPlus size={14} /> Add User
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <input
                  id="admin-user-search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search username, email, name..."
                  className="input"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}
                />
              </div>
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as any); setPage(0); }} className="input" style={{ width: 140 }}>
                <option value="ALL">All Roles</option>
                <option value="admin">Admin</option>
                <option value="customer">Customer</option>
                <option value="driver">Driver</option>
                <option value="dispatcher">Dispatcher</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(0); }} className="input" style={{ width: 140 }}>
                <option value="ALL">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Users Table */}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{u.username} | {u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as SystemUser['role'])}
                          className="input"
                          style={{ width: 140, padding: '4px 8px', fontSize: 12, background: 'var(--bg-elevated)' }}
                        >
                          <option value="admin">Admin</option>
                          <option value="customer">Customer</option>
                          <option value="driver">Driver</option>
                          <option value="dispatcher">Dispatcher</option>
                        </select>
                      </td>
                      <td>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={u.status === 'active'}
                            onChange={() => handleStatusToggle(u.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
                          />
                          <span style={{ marginLeft: 8, fontSize: 12, color: u.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                            {u.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {new Date(u.lastLogin).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStatusToggle(u.id)}
                            title={u.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            {u.status === 'active' ? <UserMinus size={12} /> : <UserPlus size={12} />}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteUser(u.id)}
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pagedUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination" style={{ padding: '12px 16px' }}>
                <div className="pagination-info">
                  {filteredUsers.length === 0 ? 'No results' : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filteredUsers.length)} of ${filteredUsers.length}`}
                </div>
                <div className="pagination-controls">
                  <button className="page-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft size={14} /></button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                    return <button key={pg} className={`page-btn ${pg === page ? 'active' : ''}`} onClick={() => setPage(pg)}>{pg + 1}</button>;
                  })}
                  <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight size={14} /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Service Health */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} color="var(--brand-400)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Service Health</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.services.filter(s => s.status === 'up').length} / {stats.services.length} healthy</div>
              </div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {stats.services.map((svc) => (
                <div
                  key={svc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--bg-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: svc.status === 'up' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        animation: svc.status === 'up' ? 'dotPulse 2s infinite' : 'none',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{svc.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <span style={{ color: svc.status === 'up' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {svc.status === 'up' ? <Wifi size={14} /> : <WifiOff size={14} />}
                      {svc.status === 'up' ? 'Online' : 'Offline'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{svc.latency}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Flags / Config */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Feature Flags & Configuration</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280, 1fr))', gap: 12 }}>
            {FEATURE_FLAGS.map((flag) => (
              <FeatureFlagCard key={flag.featureKey} name={flag.name} description={flag.description} enabled={flag.enabled} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureFlagCard({ name, description, enabled }: { name: string; description: string; enabled: boolean }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={() => {}} style={{ width: 18, height: 18, accentColor: 'var(--brand-500)' }} />
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{description}</div>
    </div>
  );
}