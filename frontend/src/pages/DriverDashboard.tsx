import { useState, useEffect, useCallback } from 'react';
import { MapPin, Truck, CheckCircle, XCircle, Clock, AlertCircle, Navigation2, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import { DeliveryStatusBadge } from '../components/StatusBadge';
import type { Delivery, DeliveryStatus } from '../types/api';
import { orderApi, driverApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const STATUS_ACTION_MAP: Record<DeliveryStatus, { label: string; action: string; color: string; icon: React.ReactNode } | null> = {
  ASSIGNED: { label: 'Pick Up', action: 'pickup', color: 'var(--accent-cyan)', icon: <Truck size={14} /> },
  PICKED_UP: { label: 'Start Delivery', action: 'start', color: 'var(--accent-amber)', icon: <Navigation2 size={14} /> },
  IN_TRANSIT: { label: 'Complete', action: 'complete', color: 'var(--accent-emerald)', icon: <CheckCircle size={14} /> },
  CREATED: null,
  ASSIGNING: null,
  DELIVERED: null,
  CANCELLED: null,
};

export default function DriverDashboard() {
  const { addToast } = useToast();
  const { isDemoMode, user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [watchingLocation, setWatchingLocation] = useState(false);

  const driverId = user?.sub; // From JWT

  const loadAssignedDeliveries = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    try {
      if (isDemoMode) throw new Error('demo');

      // Fetch all deliveries and filter for this driver
      const res = await orderApi.listDeliveries(0, 200);
      const allDeliveries: Delivery[] = res.data.content ?? [];
      const myDeliveries = allDeliveries.filter(d => d.driverId === driverId && 
        ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status)
      );
      setDeliveries(myDeliveries);
    } catch {
      if (!isDemoMode) addToast('warning', 'Running in demo mode — backend not reachable');
      // Demo data
      setDeliveries([
        { id: 'demo-1', customerId: 'cust-1', pickupAddress: '123 Main St, NYC', pickupLatitude: 40.7128, pickupLongitude: -74.0060, dropoffAddress: '456 Broadway, NYC', dropoffLatitude: 40.7589, dropoffLongitude: -73.9851, packageType: 'DOCUMENTS', packageWeight: 0.5, status: 'ASSIGNED', driverId: driverId!, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'demo-2', customerId: 'cust-2', pickupAddress: '789 Park Ave, NYC', pickupLatitude: 40.7614, pickupLongitude: -73.9776, dropoffAddress: '321 5th Ave, NYC', dropoffLatitude: 40.7484, dropoffLongitude: -73.9857, packageType: 'FOOD', packageWeight: 2.0, status: 'PICKED_UP', driverId: driverId!, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [driverId, isDemoMode, addToast]);

  useEffect(() => { loadAssignedDeliveries(); }, [loadAssignedDeliveries]);

  // Start watching driver location
  useEffect(() => {
    if (!driverId || !navigator.geolocation) return;
    
    setWatchingLocation(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        // Update location in background
        driverApi.updateLocation(driverId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading || undefined,
          speed: pos.coords.speed || undefined,
        }).catch(() => {}); // Silent fail
      },
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => { navigator.geolocation.clearWatch(watchId); setWatchingLocation(false); };
  }, [driverId]);

  const handleAction = async (delivery: Delivery, action: string) => {
    setActionLoading(delivery.id);
    try {
      if (!isDemoMode) {
        if (action === 'pickup') await orderApi.pickupDelivery(delivery.id);
        else if (action === 'start') await orderApi.startDelivery(delivery.id);
        else if (action === 'complete') await orderApi.completeDelivery(delivery.id);
      }
      // Refresh
      await loadAssignedDeliveries();
      addToast('success', `Delivery ${action} completed!`);
    } catch (err) {
      addToast('error', `Failed to ${action} delivery`);
    } finally {
      setActionLoading(null);
    }
  };

  const getNextAction = (status: DeliveryStatus) => STATUS_ACTION_MAP[status];

  const statusOrder: DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
  const currentIndex = statusOrder.indexOf(deliveries[0]?.status || 'ASSIGNED');

  return (
    <div>
      <Header
        title="Driver Dashboard"
        subtitle={isDemoMode ? 'Demo Mode — Your active deliveries' : 'Your active deliveries and actions'}
        onRefresh={loadAssignedDeliveries}
        loading={loading}
      />
      <div className="page-content">
        {isDemoMode && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: 'var(--accent-amber)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} /> Running in <strong>Demo Mode</strong> — showing sample data.
          </div>
        )}

        {/* Location Status */}
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: watchingLocation ? 'var(--accent-emerald)' : 'var(--accent-rose)', animation: watchingLocation ? 'dotPulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{watchingLocation ? 'Location tracking active' : 'Location tracking inactive'}</span>
          </div>
          {driverLocation && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {driverLocation.lat.toFixed(4)}, {driverLocation.lon.toFixed(4)}
            </span>
          )}
          <button 
            className="btn btn-sm btn-secondary" 
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setDriverLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    if (driverId) {
                      driverApi.updateLocation(driverId, { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                    }
                  }
                );
              }
            }}
            disabled={actionLoading !== null}
          >
            <RefreshCw size={13} /> Refresh Location
          </button>
        </div>

        {/* Progress Tracker */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {statusOrder.map((s, i) => (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{ 
                  width: 12, height: 12, borderRadius: '50%', 
                  background: i <= currentIndex ? 'var(--brand-400)' : 'var(--bg-border)',
                  border: i === currentIndex ? '2px solid var(--brand-400)' : 'none',
                  zIndex: 1
                }} />
                {i < statusOrder.length - 1 && (
                  <div style={{ position: 'absolute', top: 5, left: '50%', width: '100%', height: 2, background: i < currentIndex ? 'var(--brand-400)' : 'var(--bg-border)', zIndex: 0 }} />
                )}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{s.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Deliveries */}
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: 20, marginBottom: 12 }}>
              <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: '60%' }} />
            </div>
          ))
        ) : deliveries.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Truck size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <h3 style={{ marginBottom: 8 }}>No active deliveries</h3>
            <p>You're all caught up! New assignments will appear here.</p>
          </div>
        ) : (
          deliveries.map((d) => {
            const action = getNextAction(d.status);
            const pickupDistance = driverLocation ? (
              Math.sqrt(
                Math.pow(d.pickupLatitude - driverLocation.lat, 2) + 
                Math.pow(d.pickupLongitude - driverLocation.lon, 2)
              ) * 111 // rough km
            ).toFixed(1) : null;

            return (
              <div key={d.id} className="card card-hover" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                      {d.packageType.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--brand-300)' }}>{d.id.slice(0, 12)}...</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} color="var(--accent-cyan)" />
                        {d.pickupAddress}
                      </div>
                    </div>
                  </div>
                  <DeliveryStatusBadge status={d.status} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Package</div>
                    <div style={{ fontWeight: 600 }}>{d.packageType}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{d.packageWeight} kg</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Dropoff</div>
                    <div style={{ fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dropoffAddress}</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                      {pickupDistance ? 'Distance to Pickup' : 'Pickup'}
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      {pickupDistance ? `${pickupDistance} km` : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          <MapPin size={12} />
                          Tap to view
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {action && (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', gap: 8, background: action.color, borderColor: action.color }}
                    onClick={() => handleAction(d, action.action)}
                    disabled={actionLoading === d.id}
                    id={`btn-${action.action}-${d.id}`}
                  >
                    {actionLoading === d.id ? <span className="spinner" style={{ width: 16, height: 16 }} /> : action.icon}
                    {actionLoading === d.id ? `Completing...` : action.label}
                  </button>
                )}

                {!action && d.status !== 'CREATED' && d.status !== 'ASSIGNING' && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                    {d.status === 'DELIVERED' ? '✅ Delivery completed' : d.status === 'CANCELLED' ? '❌ Delivery cancelled' : 'Waiting for dispatch...'}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Current Location on Map (placeholder) */}
        {driverLocation && (
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Your Current Location</div>
            <div style={{ height: 200, background: 'var(--bg-elevated)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--bg-border)' }}>
              📍 {driverLocation.lat.toFixed(4)}, {driverLocation.lon.toFixed(4)} (Map integration placeholder)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}