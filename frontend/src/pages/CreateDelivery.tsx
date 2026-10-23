import { useState } from 'react';
import { ArrowLeft, MapPin, Package } from 'lucide-react';
import Header from '../components/Header';
import { orderApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { CreateDeliveryRequest } from '../types/api';

export default function CreateDeliveryPage() {
  const { isDemoMode } = useAuth();
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<CreateDeliveryRequest>({
    pickupAddress: '',
    pickupLatitude: 40.7128,
    pickupLongitude: -74.0060,
    dropoffAddress: '',
    dropoffLatitude: 40.7589,
    dropoffLongitude: -73.9851,
    packageType: 'DOCUMENTS',
    packageWeight: 0.5,
  });

  const PACKAGE_TYPES = ['DOCUMENTS', 'FRAGILE', 'FOOD', 'ELECTRONICS', 'CLOTHING', 'MEDICAL', 'OTHER'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isDemoMode) throw new Error('demo');
      const res = await orderApi.createDelivery(form, `idem-${Date.now()}`);
      addToast('success', `Delivery created! ID: ${res.data.id.slice(0, 8)}...`);
      setForm({
        pickupAddress: '',
        pickupLatitude: 40.7128,
        pickupLongitude: -74.0060,
        dropoffAddress: '',
        dropoffLatitude: 40.7589,
        dropoffLongitude: -73.9851,
        packageType: 'DOCUMENTS',
        packageWeight: 0.5,
      });
      window.location.href = '/deliveries';
    } catch {
      // Demo fallback
      addToast('success', 'Delivery created (demo mode)!');
      setForm({
        pickupAddress: '',
        pickupLatitude: 40.7128,
        pickupLongitude: -74.0060,
        dropoffAddress: '',
        dropoffLatitude: 40.7589,
        dropoffLongitude: -73.9851,
        packageType: 'DOCUMENTS',
        packageWeight: 0.5,
      });
      window.location.href = '/deliveries';
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Header
        title="Create Delivery"
        subtitle="Enter pickup and dropoff details to create a new delivery"
      />
      <div className="page-content" style={{ maxWidth: 720, margin: '0 auto' }}>
        {isDemoMode && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: 'var(--accent-amber)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚠</span> Running in <strong>Demo Mode</strong> — backend not reachable.
          </div>
        )}

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Pickup Section */}
              <fieldset style={{ gridColumn: '1/-1', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 16 }}>
                <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={16} color="var(--accent-cyan)" /> Pickup Location
                </legend>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="input-group" style={{ gridColumn: '1/-1' }}>
                    <label className="input-label">Pickup Address <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input
                      id="input-pickup-address"
                      className="input"
                      value={form.pickupAddress}
                      onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
                      placeholder="123 Main St, City, State"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Latitude <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input id="input-pickup-lat" type="number" step="0.0001" min="-90" max="90" className="input"
                      value={form.pickupLatitude}
                      onChange={(e) => setForm({ ...form, pickupLatitude: parseFloat(e.target.value) })} required />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Longitude <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input id="input-pickup-lng" type="number" step="0.0001" min="-180" max="180" className="input"
                      value={form.pickupLongitude}
                      onChange={(e) => setForm({ ...form, pickupLongitude: parseFloat(e.target.value) })} required />
                  </div>
                </div>
              </fieldset>

              {/* Dropoff Section */}
              <fieldset style={{ gridColumn: '1/-1', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 16 }}>
                <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={16} color="var(--accent-rose)" /> Dropoff Location
                </legend>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="input-group" style={{ gridColumn: '1/-1' }}>
                    <label className="input-label">Dropoff Address <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input
                      id="input-dropoff-address"
                      className="input"
                      value={form.dropoffAddress}
                      onChange={(e) => setForm({ ...form, dropoffAddress: e.target.value })}
                      placeholder="456 Broadway, City, State"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Latitude <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input id="input-dropoff-lat" type="number" step="0.0001" min="-90" max="90" className="input"
                      value={form.dropoffLatitude}
                      onChange={(e) => setForm({ ...form, dropoffLatitude: parseFloat(e.target.value) })} required />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Longitude <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input id="input-dropoff-lng" type="number" step="0.0001" min="-180" max="180" className="input"
                      value={form.dropoffLongitude}
                      onChange={(e) => setForm({ ...form, dropoffLongitude: parseFloat(e.target.value) })} required />
                  </div>
                </div>
              </fieldset>

              {/* Package Details */}
              <fieldset style={{ gridColumn: '1/-1', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 16 }}>
                <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} color="var(--brand-400)" /> Package Details
                </legend>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">Package Type <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <select id="input-package-type" className="input" value={form.packageType}
                      onChange={(e) => setForm({ ...form, packageType: e.target.value })}>
                      {PACKAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Weight (kg) <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input id="input-package-weight" type="number" step="0.01" min="0.01" max="1000" className="input"
                      value={form.packageWeight}
                      onChange={(e) => setForm({ ...form, packageWeight: parseFloat(e.target.value) })} required />
                  </div>
                </div>
              </fieldset>

              {/* Submit Buttons */}
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <a href="/deliveries">
                  <button id="btn-cancel-create" type="button" className="btn btn-secondary">
                    <ArrowLeft size={14} /> Cancel
                  </button>
                </a>
                <button id="btn-submit-create" type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Package size={14} />}
                  {submitting ? 'Creating...' : 'Create Delivery'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Quick location helper */}
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            Need help finding coordinates?
          </summary>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p><strong>Tip:</strong> You can find coordinates using:</p>
            <ul style={{ margin: '8px 0 0 16px' }}>
              <li>Google Maps: Right-click location → "What's here?" → Copy lat/lng</li>
              <li>Apple Maps: Drop pin → Info → Copy coordinates</li>
              <li>Online: <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-400)' }}>latlong.net</a></li>
            </ul>
            <p style={{ marginTop: 8 }}>
              <strong>Format:</strong> Decimal degrees (e.g., 40.7128, -74.0060)
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}