'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
// We keep this import, but the CDN link in index.html acts as a backup
import 'leaflet/dist/leaflet.css'; 

export interface LeafletMapHandle {
  recenter: () => void;
}

interface FriendLocation {
  user_id: string;
  latitude: string | number | null;
  longitude: string | number | null;
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface LeafletMapProps {
  userLocation: { latitude: number; longitude: number } | null;
  friendsLocations: FriendLocation[];
  loading?: boolean;
  error?: string | null;
  mapStyle?: 'standard' | 'satellite';
}

const toNumber = (val: string | number | null | undefined): number | null => {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return Number.isFinite(num) ? num : null;
};

const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(({
  userLocation,
  friendsLocations,
  loading,
  error,
  mapStyle = 'standard'
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const tileLayerRef = useRef<any>(null);
  
  const [isClient, setIsClient] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const hasInitializedCenter = useRef(false);
  const userHasInteracted = useRef(false);

  const recenterMap = () => {
    if (!mapRef.current || !userLocation) return;
    userHasInteracted.current = false;
    mapRef.current.setView([userLocation.latitude, userLocation.longitude], 15, { animate: true });
  };

  useImperativeHandle(ref, () => ({ recenter: recenterMap }));

  useEffect(() => { setIsClient(true); }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!isClient || !mapContainerRef.current || mapRef.current) return;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;

        const fallback: [number, number] = [6.5244, 3.3792]; // Lagos
        const center: [number, number] = userLocation
          ? [userLocation.latitude, userLocation.longitude]
          : fallback;

        const map = L.map(mapContainerRef.current, {
          center: center,
          zoom: 13,
          zoomControl: false,
          attributionControl: false
        });

        L.control.attribution({ prefix: false }).addTo(map);

        const handleInteraction = () => { userHasInteracted.current = true; };
        map.on('movestart', handleInteraction);
        map.on('zoomstart', handleInteraction);
        map.on('dragstart', handleInteraction);

        mapRef.current = map;
        setMapReady(true);

        // Force a resize calculation after mount to prevent grey tiles
        setTimeout(() => {
          map.invalidateSize();
        }, 100);

      } catch (err) {
        console.error('Failed to initialize map:', err);
      }
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [isClient]);

  // 2. Handle Map Style
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const updateTileLayer = async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;

      if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);

      const standardUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

      const url = mapStyle === 'satellite' ? satelliteUrl : standardUrl;
      
      tileLayerRef.current = L.tileLayer(url, { maxZoom: 19 }).addTo(map);
    };

    updateTileLayer();
  }, [mapReady, mapStyle]);

  // 3. Update Markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const updateMarkers = async () => {
      try {
        const L = (await import('leaflet')).default;
        const map = mapRef.current;

        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        const allPoints: [number, number][] = [];

        // Add User
        if (userLocation) {
          const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `<div style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
                    <span style="position: absolute; width: 100%; height: 100%; background-color: #3b82f6; border-radius: 9999px; opacity: 0.75; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
                    <span style="position: relative; width: 16px; height: 16px; background-color: #2563eb; border: 2px solid white; border-radius: 9999px;"></span>
                   </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          const userMarker = L.marker([userLocation.latitude, userLocation.longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
          markersRef.current.push(userMarker);
          allPoints.push([userLocation.latitude, userLocation.longitude]);
        }

        // Add Friends
        const validFriends = friendsLocations
          .map(f => ({
            id: f.user_id,
            name: f.profiles?.display_name || 'Friend',
            avatar: f.profiles?.avatar_url,
            latitude: toNumber(f.latitude),
            longitude: toNumber(f.longitude),
          }))
          .filter(f => f.latitude !== null && f.longitude !== null);

        validFriends.forEach(friend => {
          const avatarUrl = friend.avatar || "https://github.com/shadcn.png";
          const customIcon = L.divIcon({
            className: '',
            html: `<div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid white; background-image: url('${avatarUrl}'); background-size: cover; background-position: center; box-shadow: 0 4px 10px rgba(0,0,0,0.4); background-color: #e2e8f0; position: relative;"></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
          });

          const marker = L.marker([friend.latitude!, friend.longitude!], { icon: customIcon }).addTo(map);
          marker.bindPopup(`<div style="font-weight:bold;text-align:center;">${friend.name}</div>`);
          markersRef.current.push(marker);
          allPoints.push([friend.latitude!, friend.longitude!]);
        });

        // Auto Fit
        if (!hasInitializedCenter.current && !userHasInteracted.current) {
          if (allPoints.length > 1) {
            const bounds = L.latLngBounds(allPoints);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          } else if (allPoints.length === 1) {
            map.setView(allPoints[0], 14);
          } else if (userLocation) {
            map.setView([userLocation.latitude, userLocation.longitude], 14);
          }
          hasInitializedCenter.current = true;
        }
      } catch (err) {
        console.error('Failed to update markers:', err);
      }
    };

    updateMarkers();
  }, [mapReady, userLocation, friendsLocations]);

  // Handle Resize
  useEffect(() => {
    if (!mapRef.current) return;
    const handleResize = () => { mapRef.current.invalidateSize(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mapReady]);

  if (!isClient) return <div className="h-full w-full bg-muted flex items-center justify-center">Loading Map...</div>;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', isolation: 'isolate' }}>
      {/* CRITICAL FIX: 
         We inject styles directly here to override Tailwind's img { max-width: 100% } rule 
         which breaks Leaflet tiles.
      */}
      <style>{`
        .leaflet-tile { max-width: none !important; }
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 1000 !important; }
      `}</style>
      
      <div
        ref={mapContainerRef}
        style={{ height: '100%', width: '100%', background: '#e5e7eb', zIndex: 0 }}
      />

      {(!mapReady || loading) && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, display: 'flex', 
          alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Locating...</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div style={{
          position: 'absolute', top: '80px', left: '16px', right: '16px', zIndex: 50,
          padding: '12px', borderRadius: '8px', backgroundColor: '#ef4444', color: 'white',
          textAlign: 'center', fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default LeafletMap;
