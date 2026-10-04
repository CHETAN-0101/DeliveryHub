import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCircle, Info, AlertTriangle, Package, Truck, Clock, X, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import { notificationApi } from '../services/api';
import type { NotificationItem, NotificationType } from '../types/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { format } from 'date-fns';

// ---- Static demo notifications (used when backend unreachable) ----
const DEMO_NOTIFICATIONS: NotificationItem[] = [
  { id: '1', type: 'delivery', title: 'Delivery Completed', message: 'Delivery #a1b2c3d4 has been successfully delivered to 456 Broadway, NY', read: false, timestamp: new Date(Date.now() - 120000).toISOString() },
  { id: '2', type: 'alert', title: 'High Risk Delivery', message: 'Delivery #e5f6g7h8 flagged as HIGH RISK due to severe weather conditions', read: false, timestamp: new Date(Date.now() - 300000).toISOString() },
  { id: '3', type: 'driver', title: 'Driver Offline', message: 'Driver Marcus Johnson went offline unexpectedly with 2 active deliveries', read: false, timestamp: new Date(Date.now() - 600000).toISOString() },
  { id: '4', type: 'system', title: 'Dispatch Saga Failed', message: 'Delivery #i9j0k1l2 saga failed after 3 retries. Manual intervention required.', read: true, timestamp: new Date(Date.now() - 900000).toISOString() },
  { id: '5', type: 'delivery', title: 'New Delivery Created', message: 'Customer #cust-007 placed a new delivery order for ELECTRONICS package', read: true, timestamp: new Date(Date.now() - 1800000).toISOString() },
  { id: '6', type: 'driver', title: 'Driver Now Available', message: 'Driver Sarah Lee completed her delivery and is now available in Brooklyn area', read: true, timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: '7', type: 'system', title: 'Service Latency Alert', message: 'The notification microservice is experiencing high latency. Email notifications delayed.', read: true, timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: '8', type: 'delivery', title: 'Delivery Cancelled', message: 'Delivery #m3n4o5p6 was cancelled by customer. Reason: Change of plans', read: true, timestamp: new Date(Date.now() - 10800000).toISOString() },
];

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  delivery: <Package size={16} />,
  driver: <Truck size={16} />,
  system: <Info size={16} />,
  alert: <AlertTriangle size={16} />,
};

const TYPE_COLORS: Record<NotificationType, { icon: string; bg: string }> = {
  delivery: { icon: 'var(--brand-400)', bg: 'rgba(99,102,241,0.12)' },
  driver: { icon: 'var(--accent-cyan)', bg: 'rgba(6,182,212,0.12)' },
  system: { icon: 'var(--text-muted)', bg: 'rgba(100,116,139,0.12)' },
  alert: { icon: 'var(--accent-rose)', bg: 'rgba(244,63,94,0.12)' },
};

export default function NotificationsPage() {
  const { isDemoMode } = useAuth();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await notificationApi.list(0, 50);
      setNotifications(res.data.content ?? []);
    } catch {
      setNotifications(DEMO_NOTIFICATIONS);
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    try {
      if (!isDemoMode) await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Still update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const markRead = async (id: string) => {
    try {
      if (!isDemoMode) await notificationApi.markRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch {
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    }
  };

  const dismiss = async (id: string) => {
    try {
      if (!isDemoMode) await notificationApi.dismiss(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const filtered = notifications.filter((n) => filter === 'all' || !n.read);

  return (
    <div>
      <Header title="Notifications" subtitle="System alerts and delivery updates" onRefresh={loadData} loading={loading} />
      <div className="page-content">
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} color="var(--brand-400)" />
              <span style={{ fontWeight: 600, fontSize: 15 }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ background: 'var(--accent-rose)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>
                  {unreadCount} new
                </span>
              )}
              {isDemoMode && (
                <span style={{ fontSize: 11, color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '2px 8px' }}>
                  Demo
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'unread'] as const).map((f) => (
                  <button
                    key={f}
                    id={`filter-notif-${f}`}
                    onClick={() => setFilter(f)}
                    className="btn btn-sm"
                    style={{
                      background: filter === f ? 'var(--brand-600)' : 'var(--bg-elevated)',
                      color: filter === f ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${filter === f ? 'var(--brand-600)' : 'var(--bg-border)'}`,
                      borderRadius: 6,
                    }}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <button
                id="btn-refresh-notif"
                className="btn btn-secondary btn-sm"
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw size={12} style={{ animation: loading ? 'spin 0.6s linear infinite' : 'none' }} />
                Refresh
              </button>
              {unreadCount > 0 && (
                <button
                  id="btn-mark-all-read"
                  className="btn btn-secondary btn-sm"
                  onClick={markAllRead}
                >
                  <CheckCircle size={13} />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14 }}>
                    <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 8 }} />
                      <div className="skeleton" style={{ height: 11, width: '80%' }} />
                    </div>
                  </div>
                ))
              : filtered.length === 0
              ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                  <Bell size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <div style={{ fontSize: 14 }}>No notifications</div>
                </div>
              )
              : filtered.map((n) => {
                  const colors = TYPE_COLORS[n.type];
                  return (
                    <div
                      key={n.id}
                      id={`notif-${n.id}`}
                      onClick={() => markRead(n.id)}
                      style={{
                        background: n.read ? 'var(--bg-card)' : 'var(--bg-elevated)',
                        border: `1px solid ${n.read ? 'var(--bg-border)' : 'rgba(99,102,241,0.3)'}`,
                        borderLeft: `3px solid ${n.read ? 'var(--bg-border)' : 'var(--brand-500)'}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        gap: 14,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-500)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = n.read ? 'var(--bg-border)' : 'rgba(99,102,241,0.3)'; }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: colors.bg,
                          color: colors.icon,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {TYPE_ICONS[n.type]}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontWeight: n.read ? 500 : 600, fontSize: 13 }}>{n.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                              {format(new Date(n.timestamp), 'HH:mm')}
                            </span>
                            {!n.read && (
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-500)', display: 'inline-block', flexShrink: 0 }} />
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                          {n.message}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                          {format(new Date(n.timestamp), 'MMM dd, yyyy · HH:mm')}
                        </div>
                      </div>

                      <button
                        id={`btn-dismiss-${n.id}`}
                        onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                        style={{ color: 'var(--text-muted)', padding: 4, borderRadius: 4, alignSelf: 'flex-start', transition: 'all 0.15s', flexShrink: 0 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-rose)'; (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.1)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>
    </div>
  );
}
