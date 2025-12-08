'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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

const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(({
  userLocation,
  friendsLocations,
  loading,
  error,
  mapStyle = 'standard'
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Expose recenter method
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (mapInstanceRef.current && userLocation) {
        mapInstanceRef.current.setView(
          [userLocation.latitude, userLocation.longitude], 
          15, 
          { animate: true }
        );
      }
    }
  }));

  // 1. Mount Check
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Initialize Map
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const initialize = async () => {
      try {
        const L = (await import('leaflet')).default;

        // Default to Lagos if no location
        const startCoords: [number, number] = userLocation 
          ? [userLocation.latitude, userLocation.longitude] 
          : [6.5244, 3.3792];

        const map = L.map(mapContainerRef.current, {
          center: startCoords,
          zoom: 14,
          zoomControl: false, // We use custom buttons
          attributionControl: false
        });

        // Add attribution manually to look cleaner
        L.control.attribution({ prefix: false }).addTo(map);

        mapInstanceRef.current = map;

        // Force a resize calculation to prevent grey tiles
        setTimeout(() => {
          map.invalidateSize();
        }, 100);

      } catch (err) {
        console.error("Map initialization failed:", err);
      }
    };

    initialize();

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMounted]);

  // 3. Handle Tile Layer (Style)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateLayer = async () => {
      const L = (await import('leaflet')).default;
      
      if (tileLayerRef.current) {
        mapInstanceRef.current.removeLayer(tileLayerRef.current);
      }

      const standardUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      
      const url = mapStyle === 'satellite' ? satelliteUrl : standardUrl;

      tileLayerRef.current = L.tileLayer(url, {
        maxZoom: 19,
        detectRetina: true
      }).addTo(mapInstanceRef.current);
    };

    updateLayer();
  }, [isMounted, mapStyle, mapInstanceRef.current]);

  // 4. Handle Markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;

      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // --- USER MARKER ---
      if (userLocation) {
        const userIcon = L.divIcon({
          className: 'bg-transparent border-0',
          html: `
            <div class="relative flex items-center justify-center w-6 h-6">
              <span class="absolute w-full h-full bg-blue-500 rounded-full opacity-75 animate-ping"></span>
              <span class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-md"></span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const m = L.marker([userLocation.latitude, userLocation.longitude], { 
          icon: userIcon, 
          zIndexOffset: 1000 
        }).addTo(map);
        markersRef.current.push(m);
      }

      // --- FRIEND MARKERS ---
      friendsLocations.forEach(friend => {
        const lat = typeof friend.latitude === 'string' ? parseFloat(friend.latitude) : friend.latitude;
        const lng = typeof friend.longitude === 'string' ? parseFloat(friend.longitude) : friend.longitude;

        if (lat && lng) {
          const avatar = friend.profiles?.avatar_url || "https://github.com/shadcn.png";
          
          const icon = L.divIcon({
            className: 'bg-transparent border-0',
            html: `
              <div style="
                width: 40px; height: 40px; 
                border-radius: 50%; 
                border: 2px solid white; 
                background-image: url('${avatar}'); 
                background-size: cover; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
              "></div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });

          const m = L.marker([lat, lng], { icon }).addTo(map);
          if (friend.profiles?.display_name) {
            m.bindPopup(friend.profiles.display_name);
          }
          markersRef.current.push(m);
        }
      });
    };

    updateMarkers();
  }, [userLocation, friendsLocations]);

  if (!isMounted) return <div className="w-full h-full bg-muted flex items-center justify-center">Loading Map...</div>;

  return (
    <div className="w-full h-full relative isolate">
      {/* Main Map Container */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full z-0 bg-muted"
        id="map-container"
      />

      {/* Loading Overlay */}
      {(!mapInstanceRef.current || loading) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="bg-background px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Locating...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
});

export default LeafletMap;
