import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Package, Truck, TrendingUp, Clock, CheckCircle,
  XCircle, ArrowUp, ArrowDown, AlertCircle,
} from 'lucide-react';
import Header from '../components/Header';
import { DeliveryStatusBadge, DriverStatusBadge } from '../components/StatusBadge';
import {
  generateMockDeliveries,
  generateMockDrivers,
  computeStats,
  getDeliveryChartData,
  getStatusDistribution,
} from '../data/mockData';
import type { Delivery, Driver, DashboardStats } from '../types/api';
import { orderApi, driverApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { checkAllServices, type ServiceHealth } from '../lib/health';


const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b'];

export default function Dashboard() {
  const { addToast } = useToast();
  const { isDemoMode } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ReturnType<typeof getDeliveryChartData>>([]);
  const [loading, setLoading] = useState(true);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');

      const [deliveriesRes, driversRes] = await Promise.all([
        orderApi.listDeliveries(0, 100),
        driverApi.listDrivers(100),
      ]);

      // Handle Spring Page response vs simple array
      const d: Delivery[] = deliveriesRes.data.content ?? [];
      const dr: Driver[] = driversRes.data.drivers ?? [];

      setDeliveries(d);
      setDrivers(dr);
      setStats(computeStats(d, dr));
      setChartData(getDeliveryChartData(d));
    } catch {
      // Fallback to mock data (demo mode or backend unreachable)
      const d = generateMockDeliveries(80);
      const dr = generateMockDrivers(25);
      setDeliveries(d);
      setDrivers(dr);
      setStats(computeStats(d, dr));
      setChartData(getDeliveryChartData(d));
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time health check — poll every 30s
  useEffect(() => {
    const runCheck = () => {
      checkAllServices().then(setServiceHealth).catch(() => {});
    };
    runCheck();
    const interval = setInterval(runCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusDist = getStatusDistribution(deliveries);
  const recentDeliveries = deliveries.slice(0, 8);
  const activeDrivers = drivers.filter((d) => d.status !== 'OFFLINE').slice(0, 6);

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={isDemoMode ? 'Demo Mode — Real-time overview' : 'Real-time overview of your delivery operations'}
        onRefresh={loadData}
        loading={loading}
      />
      <div className="page-content">
        {/* Demo mode banner */}
        {isDemoMode && (
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            color: 'var(--accent-amber)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle size={14} />
            Running in <strong>Demo Mode</strong> — showing generated sample data. Connect to the backend for live data.
          </div>
        )}

        {/* Stats Grid */}
        <div className="stats-grid">
          <StatCard
            icon={<Package size={20} />}
            iconBg="linear-gradient(135deg,#6366f1,#4f46e5)"
            value={stats?.totalDeliveries ?? '—'}
            label="Total Deliveries"
            change="+12.4%"
            positive
            loading={loading}
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            iconBg="linear-gradient(135deg,#06b6d4,#0891b2)"
            value={stats?.activeDeliveries ?? '—'}
            label="Active Deliveries"
            change="+5.1%"
            positive
            loading={loading}
          />
          <StatCard
            icon={<CheckCircle size={20} />}
            iconBg="linear-gradient(135deg,#10b981,#059669)"
            value={stats?.completedDeliveries ?? '—'}
            label="Completed Today"
            change="+18.2%"
            positive
            loading={loading}
          />
          <StatCard
            icon={<XCircle size={20} />}
            iconBg="linear-gradient(135deg,#f43f5e,#e11d48)"
            value={stats?.cancelledDeliveries ?? '—'}
            label="Cancelled"
            change="-3.5%"
            positive={false}
            loading={loading}
          />
          <StatCard
            icon={<Truck size={20} />}
            iconBg="linear-gradient(135deg,#8b5cf6,#7c3aed)"
            value={`${stats?.availableDrivers ?? '—'} / ${stats?.totalDrivers ?? '—'}`}
            label="Available Drivers"
            change="+2 since yesterday"
            positive
            loading={loading}
          />
          <StatCard
            icon={<Clock size={20} />}
            iconBg="linear-gradient(135deg,#f59e0b,#d97706)"
            value={`${stats?.avgDeliveryTime ?? '—'} min`}
            label="Avg Delivery Time"
            change="-4.2%"
            positive
            loading={loading}
          />
        </div>

        {/* Charts Row */}
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Area Chart */}
          <div className="card">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Delivery Trends</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Last 7 days</div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
                  Created
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Delivered
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e', display: 'inline-block' }} />
                  Cancelled
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="created" stroke="#6366f1" strokeWidth={2} fill="url(#gradCreated)" />
                <Area type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} fill="url(#gradDelivered)" />
                <Area type="monotone" dataKey="cancelled" stroke="#f43f5e" strokeWidth={2} fill="none" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Status Distribution</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>All deliveries</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusDist}
                  dataKey="value"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {statusDist.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          {/* Recent Deliveries */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Recent Deliveries</div>
              <a href="/deliveries" style={{ fontSize: 12, color: 'var(--brand-400)' }}>View all →</a>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Pickup</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeliveries.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                          {d.id.slice(0, 8)}...
                        </span>
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.pickupAddress}
                      </td>
                      <td><DeliveryStatusBadge status={d.status} /></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {format(new Date(d.createdAt), 'MMM dd, HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Drivers */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Active Drivers</div>
              <a href="/drivers" style={{ fontSize: 12, color: 'var(--brand-400)' }}>View all →</a>
            </div>
            <div style={{ padding: '8px 0' }}>
              {activeDrivers.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 20px',
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-hover))',
                      border: '1px solid var(--bg-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--brand-300)',
                    }}
                  >
                    {d.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {d.vehicleType} · ⭐ {d.rating?.toFixed(1) ?? 'N/A'}
                    </div>
                  </div>
                  <DriverStatusBadge status={d.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Health Bar */}
        <div
          style={{
            marginTop: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <AlertCircle size={14} color="var(--accent-emerald)" />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>System Health</span>
          </div>
          {serviceHealth.length === 0 ? (
            // Skeleton while checking
            [...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 18, width: 100, borderRadius: 4 }} />
            ))
          ) : (
            serviceHealth.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: s.status === 'up' ? 'var(--accent-emerald)' : s.status === 'checking' ? 'var(--accent-amber)' : 'var(--accent-rose)',
                    animation: s.status === 'up' ? 'dotPulse 2s infinite' : 'none',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: s.status === 'up' ? 'var(--text-secondary)' : 'var(--accent-rose)' }}>
                  {s.label}
                </span>
                {s.latencyMs && s.status === 'up' && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
                    {s.latencyMs}ms
                  </span>
                )}
              </div>
            ))
          )}
          {isDemoMode && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-amber)', fontWeight: 600 }}>
              ⚠ Demo Mode
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


// ---- Sub-components ----
interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  label: string;
  change: string;
  positive: boolean;
  loading?: boolean;
}

function StatCard({ icon, iconBg, value, label, change, positive, loading }: StatCardProps) {
  return (
    <div className="stat-card card-hover">
      <div className="stat-icon" style={{ background: iconBg }}>
        <span style={{ color: '#fff' }}>{icon}</span>
      </div>
      {loading ? (
        <>
          <div className="skeleton" style={{ height: 28, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 14, width: '80%' }} />
        </>
      ) : (
        <>
          <div className="stat-value" style={{ fontSize: 24 }}>{value}</div>
          <div className="stat-label">{label}</div>
          <div className={`stat-change ${positive ? 'positive' : 'negative'}`}>
            {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {change}
          </div>
        </>
      )}
    </div>
  );
}
