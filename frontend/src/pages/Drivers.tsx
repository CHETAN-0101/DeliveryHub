import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Star, Truck, X, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import Header from '../components/Header';
import { DriverStatusBadge } from '../components/StatusBadge';
import { generateMockDrivers } from '../data/mockData';
import type { Driver, CreateDriverRequest, DriverStatus, VehicleType } from '../types/api';
import { driverApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const VEHICLE_ICONS: Record<VehicleType, string> = {
  MOTORCYCLE: '🏍️',
  CAR: '🚗',
  BICYCLE: '🚲',
  VAN: '🚐',
  TRUCK: '🚛',
};

const STATUS_FILTER_OPTIONS: { label: string; value: DriverStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Available', value: 'AVAILABLE' },
  { label: 'Busy', value: 'BUSY' },
  { label: 'Reserved', value: 'RESERVED' },
  { label: 'Offline', value: 'OFFLINE' },
];

export default function DriversPage() {
  const { addToast } = useToast();
  const { isDemoMode } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  const PAGE_SIZE = 12;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await driverApi.listDrivers(200, 0);
      setDrivers(res.data.drivers ?? []);
    } catch {
      setDrivers(generateMockDrivers(40));
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = drivers
    .filter((d) => statusFilter === 'ALL' || d.status === statusFilter)
    .filter((d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search) ||
      (d.email?.toLowerCase().includes(search.toLowerCase())) ||
      d.vehicleType.toLowerCase().includes(search.toLowerCase())
    );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCreate = async (data: CreateDriverRequest) => {
    try {
      if (!isDemoMode) {
        const res = await driverApi.createDriver(data);
        setDrivers((prev) => [res.data, ...prev]);
        setShowCreateModal(false);
        addToast('success', `Driver ${res.data.name} added successfully!`);
        return;
      }
    } catch {
      // fall through to local mock
    }
    // Demo fallback
    const newDriver: Driver = {
      id: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      ...data,
      status: 'OFFLINE',
      rating: 5.0,
      totalDeliveries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDrivers((prev) => [newDriver, ...prev]);
    setShowCreateModal(false);
    addToast('success', `Driver ${newDriver.name} added (demo)!`);
  };

  const handleStatusChange = async (driver: Driver, newStatus: DriverStatus) => {
    try {
      if (!isDemoMode) {
        await driverApi.updateStatus(driver.id, { status: newStatus });
      }
      setDrivers((prev) =>
        prev.map((d) => d.id === driver.id ? { ...d, status: newStatus } : d)
      );
      addToast('info', `${driver.name} status updated to ${newStatus}`);
    } catch {
      addToast('error', `Failed to update status for ${driver.name}`);
    }
  };

  return (
    <div>
      <Header
        title="Drivers"
        subtitle="Manage driver fleet and real-time status"
        onRefresh={loadData}
        loading={loading}
      />
      <div className="page-content">
        {/* Stats row */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          {STATUS_FILTER_OPTIONS.filter((o) => o.value !== 'ALL').map((opt) => {
            const count = drivers.filter((d) => d.status === opt.value).length;
            const COLOR_MAP: Record<string, string> = {
              AVAILABLE: 'var(--accent-emerald)',
              BUSY: 'var(--accent-rose)',
              RESERVED: 'var(--accent-amber)',
              OFFLINE: 'var(--text-muted)',
            };
            const color = COLOR_MAP[opt.value] || 'var(--brand-400)';
            return (
              <div key={opt.value} className="stat-card" style={{ padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.label}</div>
              </div>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: '7px 12px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              id="driver-search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by name, phone, vehicle..."
              style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', flex: 1 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--text-muted)' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                id={`filter-driver-${opt.value.toLowerCase()}`}
                onClick={() => { setStatusFilter(opt.value); setPage(0); }}
                className="btn btn-sm"
                style={{
                  background: statusFilter === opt.value ? 'var(--brand-600)' : 'var(--bg-elevated)',
                  color: statusFilter === opt.value ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${statusFilter === opt.value ? 'var(--brand-600)' : 'var(--bg-border)'}`,
                  borderRadius: 6,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            id="btn-add-driver"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={15} />
            Add Driver
          </button>
        </div>

        {/* Driver Cards Grid */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card" style={{ padding: 18 }}>
                  <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 10, marginBottom: 12 }} />
                  <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              ))
            : paged.map((d) => (
                <div
                  key={d.id}
                  className="card card-hover"
                  style={{ padding: 18, cursor: 'pointer' }}
                  onClick={() => setSelectedDriver(d)}
                  id={`driver-card-${d.id}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {d.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.phone}</div>
                      </div>
                    </div>
                    <DriverStatusBadge status={d.status} />
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>{VEHICLE_ICONS[d.vehicleType]}</span>
                      {d.vehicleType}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--accent-amber)' }}>
                      <Star size={11} fill="currentColor" />
                      {d.rating?.toFixed(1) ?? 'N/A'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {d.totalDeliveries ?? 0} deliveries
                    </div>
                  </div>

                  {d.licensePlate && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-elevated)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                      {d.licensePlate}
                    </div>
                  )}

                  {/* Quick status change */}
                  <div style={{ marginTop: 12, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    {(['AVAILABLE', 'OFFLINE'] as DriverStatus[]).map((s) => (
                      <button
                        key={s}
                        id={`btn-status-${d.id}-${s.toLowerCase()}`}
                        className="btn btn-sm"
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(d, s); }}
                        style={{
                          background: d.status === s ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                          color: d.status === s ? 'var(--brand-300)' : 'var(--text-secondary)',
                          border: `1px solid ${d.status === s ? 'var(--brand-500)' : 'var(--bg-border)'}`,
                          fontSize: 11,
                          borderRadius: 6,
                        }}
                      >
                        {s === 'AVAILABLE' ? '✓ Available' : '⊘ Offline'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination" style={{ marginTop: 16 }}>
            <div className="pagination-info">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="pagination-controls">
              <button className="page-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                return (
                  <button key={pg} className={`page-btn ${pg === page ? 'active' : ''}`} onClick={() => setPage(pg)}>
                    {pg + 1}
                  </button>
                );
              })}
              <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateDriverModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}

      {selectedDriver && (
        <DriverDetailModal
          driver={selectedDriver}
          onClose={() => setSelectedDriver(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

// ---- Create Driver Modal ----
function CreateDriverModal({ onClose, onCreate }: { onClose: () => void; onCreate: (d: CreateDriverRequest) => void }) {
  const [form, setForm] = useState<CreateDriverRequest>({
    name: '',
    phone: '',
    email: '',
    vehicleType: 'MOTORCYCLE',
    licensePlate: '',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Truck size={18} color="var(--brand-400)" /> Add New Driver
            </span>
          </div>
          <button id="modal-close-driver-create" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onCreate(form); }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group" style={{ gridColumn: '1/-1' }}>
              <label className="input-label">Full Name *</label>
              <input id="input-driver-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Driver" required />
            </div>
            <div className="input-group">
              <label className="input-label">Phone *</label>
              <input id="input-driver-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" required />
            </div>
            <div className="input-group">
              <label className="input-label">Email</label>
              <input id="input-driver-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="driver@email.com" />
            </div>
            <div className="input-group">
              <label className="input-label">Vehicle Type *</label>
              <select id="input-driver-vehicle" className="input" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value as VehicleType })}>
                {(['MOTORCYCLE', 'CAR', 'BICYCLE', 'VAN', 'TRUCK'] as VehicleType[]).map((v) => (
                  <option key={v} value={v}>{VEHICLE_ICONS[v]} {v}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">License Plate</label>
              <input id="input-driver-plate" className="input" value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} placeholder="NY-1234" />
            </div>
          </div>

          <div className="modal-footer">
            <button id="btn-cancel-driver-create" type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="btn-submit-driver-create" type="submit" className="btn btn-primary" disabled={!form.name || !form.phone}>
              <Plus size={14} /> Add Driver
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Driver Detail Modal ----
function DriverDetailModal({ driver, onClose, onStatusChange }: {
  driver: Driver;
  onClose: () => void;
  onStatusChange: (d: Driver, s: DriverStatus) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              {driver.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{driver.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{driver.phone}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DriverStatusBadge status={driver.status} />
            <button id="modal-close-driver-detail" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Vehicle', value: `${VEHICLE_ICONS[driver.vehicleType]} ${driver.vehicleType}` },
            { label: 'Rating', value: `⭐ ${driver.rating?.toFixed(1) ?? 'N/A'}` },
            { label: 'Deliveries', value: String(driver.totalDeliveries ?? 0) },
          ].map((item) => (
            <div key={item.label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {driver.currentLatitude && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <MapPin size={14} color="var(--accent-cyan)" />
            Location: {driver.currentLatitude.toFixed(4)}, {driver.currentLongitude?.toFixed(4)}
            {driver.lastLocationUpdate && (
              <span style={{ color: 'var(--text-muted)' }}>
                · Updated {format(new Date(driver.lastLocationUpdate), 'HH:mm')}
              </span>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Set status:</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['OFFLINE', 'AVAILABLE', 'RESERVED', 'BUSY'] as DriverStatus[]).map((s) => (
            <button
              key={s}
              id={`btn-modal-status-${s.toLowerCase()}`}
              className="btn btn-sm"
              onClick={() => { onStatusChange(driver, s); onClose(); }}
              style={{
                background: driver.status === s ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                color: driver.status === s ? 'var(--brand-300)' : 'var(--text-secondary)',
                border: `1px solid ${driver.status === s ? 'var(--brand-500)' : 'var(--bg-border)'}`,
                borderRadius: 6,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="modal-footer">
          <button id="btn-close-driver-detail" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
