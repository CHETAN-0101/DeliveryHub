import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapViewProps {
  /** Center coordinates [lng, lat] */
  center?: [number, number];
  /** Zoom level */
  zoom?: number;
  /** Delivery pickup location */
  pickup?: { lat: number; lng: number; address: string };
  /** Delivery dropoff location */
  dropoff?: { lat: number; lng: number; address: string };
  /** Driver current location */
  driverLocation?: { lat: number; lng: number; driverId?: string; driverName?: string } | null;
  /** Route coordinates [[lng, lat], ...] */
  route?: [number, number][];
  /** Map style URL */
  style?: string;
  /** Whether to show controls */
  showControls?: boolean;
  /** Height of the map container */
  height?: string;
  /** Width of the map container */
  width?: string;
  /** Callback when map is loaded */
  onLoad?: (map: maplibregl.Map) => void;
  /** Custom markers */
  customMarkers?: Array<{
    coordinates: [number, number];
    element: HTMLElement;
    popup?: string;
  }>;
}

export function MapView({
  center = [-74.0060, 40.7128], // Default to NYC
  zoom = 12,
  pickup,
  dropoff,
  driverLocation,
  route,
  style = 'https://demotiles.maplibre.org/style.json',
  showControls = true,
  height = '400px',
  width = '100%',
  onLoad,
  customMarkers = [],
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style,
        center,
        zoom,
        attributionControl: false,
      });

      mapRef.current = map;

      map.on('load', () => {
        setMapLoaded(true);
        setError(null);

        // Add navigation controls
        if (showControls) {
          map.addControl(new maplibregl.NavigationControl(), 'top-right');
          map.addControl(new maplibregl.FullscreenControl(), 'top-right');
        }

        // Add pickup marker
        if (pickup) {
          const el = document.createElement('div');
          el.className = 'map-marker pickup-marker';
          el.style.cssText = `
            width: 32px; height: 32px; 
            border-radius: 50%; 
            background: #3b82f6; 
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 14px; font-weight: bold;
          `;
          el.textContent = '📍';

          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([pickup.lng, pickup.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
              <div style="padding: 8px; font-family: inherit;">
                <strong>Pickup</strong><br/>
                ${pickup.address}
              </div>
            `))
            .addTo(map);
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }));
        }

        // Add dropoff marker
        if (dropoff) {
          const el = document.createElement('div');
          el.className = 'map-marker dropoff-marker';
          el.style.cssText = `
            width: 32px; height: 32px; 
            border-radius: 50%; 
            background: #10b981; 
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 14px; font-weight: bold;
          `;
          el.textContent = '✓';

          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([dropoff.lng, dropoff.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
              <div style="padding: 8px; font-family: inherit;">
                <strong>Dropoff</strong><br/>
                ${dropoff.address}
              </div>
            `))
            .addTo(map);
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }));
        }

        // Add driver marker
        if (driverLocation) {
          const el = document.createElement('div');
          el.className = 'map-marker driver-marker';
          el.style.cssText = `
            width: 36px; height: 36px; 
            border-radius: 50%; 
            background: #f59e0b; 
            border: 3px solid white;
            box-shadow: 0 2px 12px rgba(245, 158, 11, 0.5);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 16px;
          `;
          el.textContent = '🚛';

          const popupContent = driverLocation.driverName
            ? `<strong>${driverLocation.driverName}</strong><br/>Driver ID: ${driverLocation.driverId?.slice(0, 8)}...`
            : 'Driver Location';

          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([driverLocation.lng, driverLocation.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
              <div style="padding: 8px; font-family: inherit;">
                ${popupContent}
              </div>
            `))
            .addTo(map);
          markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }));

          // Add pulsing animation for driver location
          const pulseEl = document.createElement('div');
          pulseEl.className = 'driver-pulse';
          pulseEl.style.cssText = `
            position: absolute;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(245, 158, 11, 0.4);
            animation: pulse 2s infinite;
            pointer-events: none;
            transform: translate(-50%, -50%);
          `;
        }

        // Add route line
        if (route && route.length > 1) {
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: route,
              },
            },
          });

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#6366f1',
              'line-width': 4,
              'line-opacity': 0.8,
              'line-dasharray': [2, 4],
            },
          });
        }

        // Add custom markers
        customMarkers.forEach(({ coordinates, element, popup }) => {
          const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
            .setLngLat(coordinates)
            .addTo(map);
          if (popup) {
            marker.setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popup));
          }
          markersRef.current.push(marker);
        });

        // Fit bounds to show all markers
        if (pickup || dropoff || driverLocation) {
          const bounds = new maplibregl.LngLatBounds();
          if (pickup) bounds.extend([pickup.lng, pickup.lat]);
          if (dropoff) bounds.extend([dropoff.lng, dropoff.lat]);
          if (driverLocation) bounds.extend([driverLocation.lng, driverLocation.lat]);
          if (route) {
            route.forEach(coord => bounds.extend(coord));
          }
          map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }

        if (onLoad) onLoad(map);
      });

      map.on('error', (e: unknown) => {
        console.error('Map error:', e);
        setError('Failed to load map');
      });
    } catch (err) {
      console.error('Map initialization error:', err);
      setError('Failed to initialize map');
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [center, zoom, pickup, dropoff, driverLocation, route, style, showControls]);

  // Update map when props change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    // Update center/zoom
    if (center) map.setCenter(center);
    if (zoom) map.setZoom(zoom);

    // Update driver location marker
    if (driverLocation) {
      // Remove old driver markers
      markersRef.current = markersRef.current.filter(m => {
        const el = m.getElement();
        if (el?.classList.contains('driver-marker')) {
          m.remove();
          return false;
        }
        return true;
      });

      // Add new driver marker
      const el = document.createElement('div');
      el.className = 'map-marker driver-marker';
      el.style.cssText = `
        width: 36px; height: 36px; 
        border-radius: 50%; 
        background: #f59e0b; 
        border: 3px solid white;
        box-shadow: 0 2px 12px rgba(245, 158, 11, 0.5);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 16px;
      `;
      el.textContent = '🚛';

      new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; font-family: inherit;">
            <strong>${driverLocation.driverName || 'Driver'}</strong><br/>
            ID: ${driverLocation.driverId?.slice(0, 8) || 'Unknown'}...
          </div>
        `))
        .addTo(mapRef.current!);
    }
  }, [driverLocation]);

  if (error) {
    return (
      <div
        style={{
          width,
          height,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-rose)',
          fontSize: 14,
        }}
      >
        Failed to load map: {error}
      </div>
    );
  }

  const loadingContent = mapLoaded ? null : (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-elevated)',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ textAlign: 'center', padding: 20 }}>
        <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32 }} />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading map...</div>
      </div>
    </div>
  );

  return (
    <div
      ref={mapContainerRef}
      style={{
        width,
        height,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--bg-border)',
      }}
    >
      {loadingContent}
    </div>
  );
}

export default MapView;