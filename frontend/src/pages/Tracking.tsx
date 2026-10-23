import { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Truck, CheckCircle, Clock, AlertCircle, ArrowLeft, RefreshCw, Shield, MapPinCheck, Navigation } from 'lucide-react';
import Header from '../components/Header';
import { MapView } from '../components/MapView';
import { orderApi } from '../services/api';
import { format } from 'date-fns';
import type { Delivery, DeliveryStatus } from '../types/api';
import { DeliveryStatusBadge } from '../components/StatusBadge';

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  CREATED: 'Order Created',
  ASSIGNING: 'Finding Driver',
  ASSIGNED: 'Driver Assigned',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_ICONS: Record<DeliveryStatus, React.ReactNode> = {
  CREATED: <MapPin size={16} color="var(--brand-400)" />,
  ASSIGNING: <Search size={16} color="var(--accent-amber)" />,
  ASSIGNED: <Truck size={16} color="var(--accent-cyan)" />,
  PICKED_UP: <MapPinCheck size={16} color="var(--accent-emerald)" />,
  IN_TRANSIT: <Navigation size={16} color="var(--accent-amber)" />,
  DELIVERED: <CheckCircle size={16} color="var(--accent-emerald)" />,
  CANCELLED: <AlertCircle size={16} color="var(--accent-rose)" />,
};

const STATUS_ORDER: DeliveryStatus[] = [
  'CREATED',
  'ASSIGNING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

export default function TrackingPage() {
  const [trackingId, setTrackingId] = useState('');
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; driverId?: string; driverName?: string } | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadTracking = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await orderApi.getDelivery(id);
      const d = res.data;
      setDelivery(d);
      setError(null);

      // Simulate driver location and route (in real app, this would come from WebSocket/ SSE)
      if (d.driverId && ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status)) {
        // Simulate driver location near pickup/dropoff
        const pickup = { lat: d.pickupLatitude, lng: d.pickupLongitude };
        const dropoff = { lat: d.dropoffLatitude, lng: d.dropoffLongitude };
        
        // Simulate driver moving along route
        const progress = d.status === 'PICKED_UP' ? 0.3 : d.status === 'IN_TRANSIT' ? 0.7 : 0.1;
        const lat = pickup.lat + (dropoff.lat - pickup.lat) * progress;
        const lng = pickup.lng + (dropoff.lng - pickup.lng) * progress;
        
        setDriverLocation({
          lat,
          lng,
          driverId: d.driverId,
          driverName: `Driver ${d.driverId?.slice(0, 8)}`,
        });

        // Generate route
        const routeCoords: [number, number][] = [];
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const lat = pickup.lat + (dropoff.lat - pickup.lat) * t;
          const lng = pickup.lng + (dropoff.lng - pickup.lng) * t;
          routeCoords.push([lng, lat]);
        }
        setRoute(routeCoords);
        setLastUpdated(new Date());
      }
    } catch {
      setError('Delivery not found. Please check the tracking ID.');
      setDelivery(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trackingId) {
      loadTracking(trackingId);
    }
  }, [trackingId, loadTracking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingId.trim()) {
      loadTracking(trackingId.trim());
    }
  };

  const handleRefresh = () => {
    if (delivery) {
      loadTracking(delivery.id);
    }
  };

  if (!delivery && !trackingId) {
    return (
      <div>
        <Header title="Track Delivery" subtitle="Enter your tracking ID to view delivery status" />
        <div className="page-content" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="card" style={{ padding: 32 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 28
              }}>
                <MapPin size={32} color="#fff" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Track Your Delivery</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Enter your tracking ID to see real-time delivery status and driver location
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group" style={{ marginBottom: 16 }}>
                <label className="input-label">Tracking ID</label>
                <input
                  id="tracking-id-input"
                  className="input"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="Enter tracking ID (e.g., 550e8400-e29b-41d4-a716-446655440000)"
                  required
                  autoFocus
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
                <MapPin size={16} /> Track Delivery
              </button>
            </form>

            <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--bg-border)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <strong>Demo Tracking IDs:</strong>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                <code>550e8400-e29b-41d4-a716-446655440000</code>
                <code>660e8400-e29b-41d4-a716-446655440001</code>
                <code>770e8400-e29b-41d4-a716-446655440002</code>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
                Or create a delivery in the <a href="/deliveries/new" style={{ color: 'var(--brand-400)' }}>Deliveries</a> page to get a real tracking ID.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Track Delivery" subtitle="Delivery not found" onRefresh={() => loadTracking(trackingId)} loading={loading} />
        <div className="page-content" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <AlertCircle size={48} color="var(--accent-rose)" style={{ marginBottom: 16 }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Delivery Not Found</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              No delivery found with tracking ID <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{trackingId}</strong>
            </p>
            <button className="btn btn-primary" onClick={() => setTrackingId('')}>
              <ArrowLeft size={16} /> Back to Search
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!delivery) {
    return null;
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(delivery.status);
  const nextStatus = currentStatusIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIndex + 1] : null;

  return (
    <div>
      <Header
        title={`Tracking ${delivery.id.slice(0, 8)}...`}
        subtitle={STATUS_LABELS[delivery.status] || delivery.status}
        onRefresh={handleRefresh}
        loading={loading}
      />
      <div className="page-content">
        {/* Progress Tracker */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Delivery Progress</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Real-time status updates</div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto' }}>
              {STATUS_ORDER.map((s, i) => (
                <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: i <= currentStatusIndex ? 'var(--brand-400)' : 'var(--bg-border)',
                    border: i === currentStatusIndex ? '3px solid var(--brand-400)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    boxShadow: i <= currentStatusIndex ? '0 0 0 4px var(--bg-base)' : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                    {STATUS_ICONS[s]}
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <div style={{ position: 'absolute', top: 13, left: '50%', width: '100%', height: 2,
                      background: i < currentStatusIndex ? 'var(--brand-400)' : 'var(--bg-border)', zIndex: 0 }} />
                  )}
                  <span style={{ fontSize: 9, color: i <= currentStatusIndex ? 'var(--brand-400)' : 'var(--text-muted)',
                    marginTop: 6, whiteSpace: 'nowrap', fontWeight: i <= currentStatusIndex ? 600 : 400 }}>
                    {STATUS_LABELS[s].replace(' ', '\n')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Live Map */}
          <div className="card" style={{ padding: 0, minHeight: 400 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Live Tracking</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {driverLocation ? 'Driver location updated' : 'No driver assigned yet'}
                </div>
              </div>
              {driverLocation && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-emerald)', animation: 'dotPulse 2s infinite' }} />
                  <span style={{ color: 'var(--accent-emerald)' }}>Live</span>
                  <span style={{ color: 'var(--text-muted)' }}>Updated {lastUpdated ? format(lastUpdated, 'HH:mm:ss') : 'now'}</span>
                </div>
              )}
            </div>
            <MapView
              center={driverLocation ? [driverLocation.lng, driverLocation.lat] : (delivery ? [delivery.dropoffLongitude, delivery.dropoffLatitude] : undefined)}
              zoom={13}
              pickup={delivery ? { lat: delivery.pickupLatitude, lng: delivery.pickupLongitude, address: delivery.pickupAddress } : undefined}
              dropoff={delivery ? { lat: delivery.dropoffLatitude, lng: delivery.dropoffLongitude, address: delivery.dropoffAddress } : undefined}
              driverLocation={driverLocation}
              route={route}
              height="350px"
              showControls={true}
            />
          </div>

          {/* Delivery Details */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Delivery Details</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                ID: {delivery.id}
              </div>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <DeliveryStatusBadge status={delivery.status} />
                {nextStatus && (
                  <span style={{ fontSize: 11, color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                    Next: {STATUS_LABELS[nextStatus]}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <DetailCard label="Pickup" value={delivery.pickupAddress} icon={<MapPin size={13} color="var(--accent-cyan)" />} />
                <DetailCard label="Dropoff" value={delivery.dropoffAddress} icon={<MapPinCheck size={13} color="var(--accent-emerald)" />} />
                <DetailCard label="Package" value={`${delivery.packageType} · ${delivery.packageWeight} kg`} icon={<Shield size={13} />} />
                <DetailCard label="Created" value={format(new Date(delivery.createdAt), 'PPpp')} icon={<Clock size={13} />} />
              </div>

              {delivery.driverId && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Assigned Driver
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                      D
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Driver {delivery.driverId.slice(0, 8)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Truck size={12} color="var(--accent-cyan)" />
                        {driverLocation ? 'En route' : 'Assigned'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleRefresh}>
                  <RefreshCw size={14} /> Refresh
                </button>
                <a href="/deliveries" style={{ flex: 1 }}>
                  <button className="btn btn-primary">
                    <ArrowLeft size={14} /> Back to Deliveries
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}