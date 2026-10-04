import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, Zap, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import { DeliveryStatusBadge, DriverStatusBadge } from '../components/StatusBadge';
import { generateMockDeliveries, generateMockDrivers } from '../data/mockData';
import type { Delivery, Driver, DispatchEvent, DispatchStats } from '../types/api';
import { dispatchApi, orderApi, driverApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { format } from 'date-fns';

const EVENT_STYLES: Record<DispatchEvent['type'], { icon: React.ReactNode; color: string }> = {
  ASSIGNED: { icon: <CheckCircle size={14} />, color: 'var(--accent-emerald)' },
  DISPATCH_STARTED: { icon: <Zap size={14} />, color: 'var(--brand-400)' },
  SAGA_COMPLETED: { icon: <CheckCircle size={14} />, color: 'var(--accent-cyan)' },
  SAGA_FAILED: { icon: <AlertCircle size={14} />, color: 'var(--accent-rose)' },
  RETRY: { icon: <Clock size={14} />, color: 'var(--accent-amber)' },
};

// ---- Mock fallback generators ----
function _generateMockEvents(deliveries: Delivery[], drivers: Driver[]): DispatchEvent[] {
  const types: DispatchEvent['type'][] = ['ASSIGNED', 'DISPATCH_STARTED', 'SAGA_COMPLETED', 'SAGA_FAILED', 'RETRY'];
  return deliveries.slice(0, 20).map((d, i) => ({
    id: `evt-${i}`,
    type: types[i % types.length],
    deliveryId: d.id,
    driverId: drivers[i % drivers.length]?.id,
    message: _eventMessage(types[i % types.length], d, drivers[i % drivers.length]),
    timestamp: new Date(Date.now() - i * 300000).toISOString(),
  }));
}

function _eventMessage(type: DispatchEvent['type'], d: Delivery, driver?: Driver): string {
  switch (type) {
    case 'ASSIGNED': return `Driver ${driver?.name ?? 'N/A'} assigned to delivery ${d.id.slice(0, 8)}`;
    case 'DISPATCH_STARTED': return `Dispatch saga started for delivery ${d.id.slice(0, 8)}`;
    case 'SAGA_COMPLETED': return `Saga completed. Delivery ${d.id.slice(0, 8)} ready for pickup`;
    case 'SAGA_FAILED': return `Saga failed for ${d.id.slice(0, 8)}. Retrying...`;
    case 'RETRY': return `Retry attempt for delivery ${d.id.slice(0, 8)} (attempt 2)`;
    default: return '';
  }
}

const MOCK_SAGA_STATS: DispatchStats = {
  started: 45, assigned: 38, completed: 32, failed: 4, retried: 6, successRate: 88,
};

export default function DispatchPage() {
  const { isDemoMode } = useAuth();
  const { addToast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [events, setEvents] = useState<DispatchEvent[]>([]);
  const [sagaStats, setSagaStats] = useState<DispatchStats>(MOCK_SAGA_STATS);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');

      const [eventsRes, statsRes, deliveriesRes, driversRes] = await Promise.all([
        dispatchApi.getEvents(50),
        dispatchApi.getStats(),
        orderApi.listDeliveries(0, 100),
        driverApi.listDrivers(100),
      ]);

      setEvents(eventsRes.data.events ?? []);
      setSagaStats(statsRes.data);
      setDeliveries(deliveriesRes.data.content ?? []);
      setDrivers(driversRes.data.drivers ?? []);
    } catch {
      // Fallback to mock data
      const d = generateMockDeliveries(50);
      const dr = generateMockDrivers(20);
      setDeliveries(d);
      setDrivers(dr);
      setEvents(_generateMockEvents(d, dr));
      setSagaStats(MOCK_SAGA_STATS);
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeDeliveries = deliveries.filter((d) =>
    ['ASSIGNING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status)
  );
  const availableDrivers = drivers.filter((d) => d.status === 'AVAILABLE');
  const busyDrivers = drivers.filter((d) => d.status === 'BUSY' || d.status === 'RESERVED');

  const sagaChartData = [
    { name: 'Started', value: sagaStats.started, fill: '#6366f1' },
    { name: 'Assigned', value: sagaStats.assigned, fill: '#06b6d4' },
    { name: 'Completed', value: sagaStats.completed, fill: '#10b981' },
    { name: 'Failed', value: sagaStats.failed, fill: '#f43f5e' },
    { name: 'Retried', value: sagaStats.retried, fill: '#f59e0b' },
  ];

  return (
    <div>
      <Header
        title="Dispatch"
        subtitle="Saga orchestration, driver assignment, and event stream"
        onRefresh={loadData}
        loading={loading}
      />
      <div className="page-content">
        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          {[
            { label: 'Active Dispatches', value: activeDeliveries.length, color: '#6366f1' },
            { label: 'Available Drivers', value: availableDrivers.length, color: '#10b981' },
            { label: 'Drivers On Route', value: busyDrivers.length, color: '#f59e0b' },
            { label: 'Saga Success Rate', value: `${sagaStats.successRate}%`, color: '#06b6d4' },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              {loading
                ? <div className="skeleton" style={{ height: 40, width: '60%' }} />
                : <>
                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
                  </>
              }
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Saga Flow Chart */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Saga Funnel (Today)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Dispatch saga orchestration pipeline</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sagaChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sagaChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Active Deliveries in Dispatch */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Active Dispatches</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeDeliveries.length} in progress</div>
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ padding: '10px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between' }}>
                      <div className="skeleton" style={{ height: 14, width: '40%' }} />
                      <div className="skeleton" style={{ height: 14, width: '25%' }} />
                    </div>
                  ))
                : activeDeliveries.slice(0, 8).map((d) => {
                    const driver = drivers.find((dr) => dr.id === d.driverId);
                    return (
                      <div
                        key={d.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 20px',
                          borderBottom: '1px solid var(--bg-border)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--brand-400)' }}>
                            {d.id.slice(0, 12)}...
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {driver ? driver.name : 'Unassigned'}
                          </div>
                        </div>
                        <DeliveryStatusBadge status={d.status} />
                      </div>
                    );
                  })
              }
              {!loading && activeDeliveries.length === 0 && (
                <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                  No active dispatches
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Driver Quick Overview */}
        {!loading && busyDrivers.length > 0 && (
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Drivers On Route</div>
              <span style={{ fontSize: 11, color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                {busyDrivers.length} active
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              {busyDrivers.slice(0, 6).map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--bg-border)',
                    flex: '0 0 50%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {d.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.vehicleType}</div>
                  </div>
                  <DriverStatusBadge status={d.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Stream */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} color="var(--brand-400)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Dispatch Event Stream</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {isDemoMode ? 'Demo event log' : 'Real-time Kafka event log'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isDemoMode ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isDemoMode ? 'var(--accent-amber)' : 'var(--accent-emerald)', display: 'inline-block', animation: 'dotPulse 1.5s infinite' }} />
              {isDemoMode ? 'Demo' : 'Live'}
            </div>
          </div>
          <div style={{ padding: 4 }}>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--bg-border)' }}>
                    <div className="skeleton" style={{ height: 14, width: 14, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 6 }} />
                      <div className="skeleton" style={{ height: 10, width: '40%' }} />
                    </div>
                  </div>
                ))
              : events.map((evt) => {
                  const style = EVENT_STYLES[evt.type];
                  return (
                    <div
                      key={evt.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '10px 20px',
                        borderBottom: '1px solid var(--bg-border)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div style={{ color: style.color, paddingTop: 2, flexShrink: 0 }}>{style.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, marginBottom: 2 }}>{evt.message}</div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{evt.type}</span>
                          <span>{format(new Date(evt.timestamp), 'HH:mm:ss')}</span>
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          background: `${style.color}20`,
                          color: style.color,
                          fontSize: 10,
                          flexShrink: 0,
                        }}
                      >
                        {evt.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })
            }
            {!loading && events.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                No dispatch events yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
