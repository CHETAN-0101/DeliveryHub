import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, ChevronLeft, ChevronRight, Package, MapPin, Scale } from 'lucide-react';
import Header from '../components/Header';
import { DeliveryStatusBadge } from '../components/StatusBadge';
import { generateMockDeliveries } from '../data/mockData';
import type { Delivery, DeliveryStatus, CreateDeliveryRequest } from '../types/api';
import { orderApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const STATUS_FILTER_OPTIONS: { label: string; value: DeliveryStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Created', value: 'CREATED' },
  { label: 'Assigning', value: 'ASSIGNING' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Picked Up', value: 'PICKED_UP' },
  { label: 'In Transit', value: 'IN_TRANSIT' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function DeliveriesPage() {
  const { addToast } = useToast();
  const { isDemoMode } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<Delivery | null>(null);

  const PAGE_SIZE = 15;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');
      // Fetch all pages (max 500 for client-side filtering)
      const res = await orderApi.listDeliveries(0, 500);
      setDeliveries(res.data.content ?? []);
    } catch {
      setDeliveries(generateMockDeliveries(80));
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = deliveries
    .filter((d) => statusFilter === 'ALL' || d.status === statusFilter)
    .filter((d) =>
      !search ||
      d.id.toLowerCase().includes(search.toLowerCase()) ||
      d.pickupAddress.toLowerCase().includes(search.toLowerCase()) ||
      d.dropoffAddress.toLowerCase().includes(search.toLowerCase()) ||
      d.packageType.toLowerCase().includes(search.toLowerCase())
    );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCreate = async (data: CreateDeliveryRequest) => {
    setSubmitting(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await orderApi.createDelivery(data, `idem-${Date.now()}`);
      setDeliveries((prev) => [res.data, ...prev]);
      setShowCreateModal(false);
      addToast('success', `Delivery created! ID: ${res.data.id.slice(0, 8)}...`);
    } catch {
      // Demo fallback
      const newDelivery: Delivery = {
        id: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        customerId: 'cust-001',
        ...data,
        status: 'CREATED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDeliveries((prev) => [newDelivery, ...prev]);
      setShowCreateModal(false);
      addToast('success', `Delivery created (demo)! ID: ${newDelivery.id.slice(0, 8)}...`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (delivery: Delivery, reason: string) => {
    try {
      if (!isDemoMode) {
        await orderApi.cancelDelivery(delivery.id, { reason });
      }
      setDeliveries((prev) =>
        prev.map((d) => d.id === delivery.id ? { ...d, status: 'CANCELLED' as DeliveryStatus } : d)
      );
      setShowCancelModal(null);
      addToast('info', `Delivery ${delivery.id.slice(0, 8)}... cancelled.`);
    } catch {
      addToast('error', 'Failed to cancel delivery. Please try again.');
    }
  };

  return (
    <div>
      <Header
        title="Deliveries"
        subtitle="Manage and track all delivery orders"
        onRefresh={loadData}
        loading={loading}
      />
      <div className="page-content">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: '7px 12px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              id="delivery-search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by ID, address, package type..."
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
                id={`filter-status-${opt.value.toLowerCase()}`}
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
            id="btn-create-delivery"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={15} />
            New Delivery
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Delivery ID</th>
                <th>Pickup</th>
                <th>Dropoff</th>
                <th>Package</th>
                <th>Weight</th>
                <th>Status</th>
                <th>Driver</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 14, width: '80%' }} /></td>
                      ))}
                    </tr>
                  ))
                : paged.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 11,
                            color: 'var(--brand-400)',
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedDelivery(d)}
                          title="View details"
                        >
                          {d.id.slice(0, 12)}...
                        </span>
                      </td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {d.pickupAddress}
                      </td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {d.dropoffAddress}
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Package size={13} color="var(--text-muted)" />
                          <span style={{ fontSize: 12 }}>{d.packageType}</span>
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.packageWeight} kg</td>
                      <td><DeliveryStatusBadge status={d.status} /></td>
                      <td style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {d.driverId ? String(d.driverId).slice(0, 8) + '...' : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {format(new Date(d.createdAt), 'MMM dd, HH:mm')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            id={`btn-view-${d.id}`}
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedDelivery(d)}
                          >
                            View
                          </button>
                          {!['DELIVERED', 'CANCELLED'].includes(d.status) && (
                            <button
                              id={`btn-cancel-${d.id}`}
                              className="btn btn-danger btn-sm"
                              onClick={() => setShowCancelModal(d)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination" style={{ padding: '12px 16px' }}>
            <div className="pagination-info">
              {filtered.length === 0 ? 'No results' : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                return (
                  <button
                    key={pg}
                    className={`page-btn ${pg === page ? 'active' : ''}`}
                    onClick={() => setPage(pg)}
                  >
                    {pg + 1}
                  </button>
                );
              })}
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateDeliveryModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          submitting={submitting}
        />
      )}

      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onCancel={(d) => { setSelectedDelivery(null); setShowCancelModal(d); }}
        />
      )}

      {showCancelModal && (
        <CancelDeliveryModal
          delivery={showCancelModal}
          onClose={() => setShowCancelModal(null)}
          onConfirm={(reason) => handleCancel(showCancelModal, reason)}
        />
      )}
    </div>
  );
}

// ---- Create Delivery Modal ----
function CreateDeliveryModal({
  onClose,
  onCreate,
  submitting,
}: {
  onClose: () => void;
  onCreate: (d: CreateDeliveryRequest) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<CreateDeliveryRequest>({
    pickupAddress: '123 Main St, New York, NY',
    pickupLatitude: 40.7128,
    pickupLongitude: -74.006,
    dropoffAddress: '456 Broadway, New York, NY',
    dropoffLatitude: 40.7589,
    dropoffLongitude: -73.9851,
    packageType: 'DOCUMENTS',
    packageWeight: 0.5,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} color="var(--brand-400)" /> Create New Delivery
            </span>
          </div>
          <button id="modal-close-create" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group" style={{ gridColumn: '1/-1' }}>
              <label className="input-label">Pickup Address</label>
              <input
                id="input-pickup-address"
                className="input"
                value={form.pickupAddress}
                onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
                placeholder="123 Main St..."
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Pickup Latitude</label>
              <input id="input-pickup-lat" type="number" step="0.0001" className="input" value={form.pickupLatitude}
                onChange={(e) => setForm({ ...form, pickupLatitude: parseFloat(e.target.value) })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Pickup Longitude</label>
              <input id="input-pickup-lng" type="number" step="0.0001" className="input" value={form.pickupLongitude}
                onChange={(e) => setForm({ ...form, pickupLongitude: parseFloat(e.target.value) })} required />
            </div>

            <div className="input-group" style={{ gridColumn: '1/-1' }}>
              <label className="input-label">Dropoff Address</label>
              <input
                id="input-dropoff-address"
                className="input"
                value={form.dropoffAddress}
                onChange={(e) => setForm({ ...form, dropoffAddress: e.target.value })}
                placeholder="456 Broadway..."
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Dropoff Latitude</label>
              <input id="input-dropoff-lat" type="number" step="0.0001" className="input" value={form.dropoffLatitude}
                onChange={(e) => setForm({ ...form, dropoffLatitude: parseFloat(e.target.value) })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Dropoff Longitude</label>
              <input id="input-dropoff-lng" type="number" step="0.0001" className="input" value={form.dropoffLongitude}
                onChange={(e) => setForm({ ...form, dropoffLongitude: parseFloat(e.target.value) })} required />
            </div>

            <div className="input-group">
              <label className="input-label">Package Type</label>
              <select id="input-package-type" className="input" value={form.packageType}
                onChange={(e) => setForm({ ...form, packageType: e.target.value })}>
                {['DOCUMENTS', 'FRAGILE', 'FOOD', 'ELECTRONICS', 'CLOTHING', 'MEDICAL'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Weight (kg)</label>
              <input id="input-package-weight" type="number" step="0.01" min="0.01" max="1000" className="input"
                value={form.packageWeight}
                onChange={(e) => setForm({ ...form, packageWeight: parseFloat(e.target.value) })} required />
            </div>
          </div>

          <div className="modal-footer">
            <button id="btn-cancel-create" type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button id="btn-submit-create" type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : <Plus size={14} />}
              Create Delivery
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Delivery Detail Modal ----
function DeliveryDetailModal({
  delivery,
  onClose,
  onCancel,
}: {
  delivery: Delivery;
  onClose: () => void;
  onCancel: (d: Delivery) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Delivery Details</div>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', marginTop: 2 }}>
              {delivery.id}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DeliveryStatusBadge status={delivery.status} />
            <button id="modal-close-detail" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DetailRow label="Pickup Address" value={delivery.pickupAddress} icon={<MapPin size={13} />} />
          <DetailRow label="Dropoff Address" value={delivery.dropoffAddress} icon={<MapPin size={13} />} />
          <DetailRow label="Package Type" value={delivery.packageType} icon={<Package size={13} />} />
          <DetailRow label="Weight" value={`${delivery.packageWeight} kg`} icon={<Scale size={13} />} />
          <DetailRow label="Customer ID" value={delivery.customerId} />
          <DetailRow label="Driver ID" value={delivery.driverId ? String(delivery.driverId) : '—'} />
          <DetailRow label="Created" value={format(new Date(delivery.createdAt), 'PPpp')} />
          <DetailRow label="Updated" value={format(new Date(delivery.updatedAt), 'PPpp')} />
        </div>

        <div className="modal-footer">
          <button id="btn-close-detail" className="btn btn-secondary" onClick={onClose}>Close</button>
          {!['DELIVERED', 'CANCELLED'].includes(delivery.status) && (
            <button
              id="btn-cancel-from-detail"
              className="btn btn-danger"
              onClick={() => onCancel(delivery)}
            >
              Cancel Delivery
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <span style={{ color: 'var(--text-muted)' }}>{icon}</span>}
        {value}
      </div>
    </div>
  );
}

// ---- Cancel Delivery Modal ----
function CancelDeliveryModal({
  delivery,
  onClose,
  onConfirm,
}: {
  delivery: Delivery;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('Customer requested cancellation');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: 'var(--accent-rose)' }}>Cancel Delivery</div>
          <button id="modal-close-cancel" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Are you sure you want to cancel delivery <strong style={{ color: 'var(--text-primary)' }}>{delivery.id.slice(0, 8)}...</strong>? This action cannot be undone.
        </p>

        <div className="input-group">
          <label className="input-label">Cancellation Reason</label>
          <input
            id="input-cancel-reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason..."
            required
          />
        </div>

        <div className="modal-footer">
          <button id="btn-close-cancel" className="btn btn-secondary" onClick={onClose}>Back</button>
          <button
            id="btn-confirm-cancel"
            className="btn btn-danger"
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}
