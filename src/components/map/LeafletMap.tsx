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
  mapStyle?: 'standard' | 'satellite'; // Added prop
}

// Helper to safely convert to number
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
  const tileLayerRef = useRef<any>(null); // Track tile layer to switch styles
  
  const [isClient, setIsClient] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const hasInitializedCenter = useRef(false);
  const userHasInteracted = useRef(false);

  // Recenter function exposed to parent
  const recenterMap = () => {
    if (!mapRef.current || !userLocation) return;
    
    userHasInteracted.current = false;
    mapRef.current.setView(
      [userLocation.latitude, userLocation.longitude],
      15, // Zoom closer on recenter
      { animate: true }
    );
  };

  useImperativeHandle(ref, () => ({
    recenter: recenterMap,
  }));

  // Ensure we're on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!isClient || !mapContainerRef.current || mapRef.current) return;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;

        // Default center (Lagos) if user location not yet found
        const fallback: [number, number] = [6.5244, 3.3792];
        const center: [number, number] = userLocation
          ? [userLocation.latitude, userLocation.longitude]
          : fallback;

        // Create map instance
        const map = L.map(mapContainerRef.current, {
          center: center,
          zoom: 13,
          zoomControl: false, // Hide default zoom buttons (we have custom UI)
          attributionControl: false
        });

        // Add attribution (bottom right)
        L.control.attribution({ prefix: false }).addTo(map);

        // Track user interactions
        const handleInteraction = () => { userHasInteracted.current = true; };
        map.on('movestart', handleInteraction);
        map.on('zoomstart', handleInteraction);
        map.on('dragstart', handleInteraction);

        mapRef.current = map;
        setMapReady(true);

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

  // 2. Handle Map Style Changes (Satellite vs Standard)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const updateTileLayer = async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;

      // Remove existing layer
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }

      const standardUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      // Esri Satellite is a free, high-quality satellite option
      const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

      const url = mapStyle === 'satellite' ? satelliteUrl : standardUrl;
      const attribution = mapStyle === 'satellite' 
        ? '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        : '&copy; OpenStreetMap contributors';

      tileLayerRef.current = L.tileLayer(url, {
        maxZoom: 19,
        attribution: attribution
      }).addTo(map);
    };

    updateTileLayer();
  }, [mapReady, mapStyle]);

  // 3. Update Markers (User + Friends)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const updateMarkers = async () => {
      try {
        const L = (await import('leaflet')).default;
        const map = mapRef.current;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        const allPoints: [number, number][] = [];

        // --- A. Add User Marker (Pulse Effect) ---
        if (userLocation) {
          // Custom HTML for a pulsing blue dot
          const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `
              <div class="relative flex items-center justify-center w-6 h-6">
                <span class="absolute w-full h-full bg-blue-500 rounded-full opacity-75 animate-ping"></span>
                <span class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-md"></span>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          const userMarker = L.marker(
            [userLocation.latitude, userLocation.longitude],
            { icon: userIcon, zIndexOffset: 1000 } // Keep user on top
          ).addTo(map);
          
          markersRef.current.push(userMarker);
          allPoints.push([userLocation.latitude, userLocation.longitude]);
        }

        // --- B. Add Friend Markers (Profile Pictures) ---
        const validFriends = friendsLocations
          .map((f) => {
            const lat = toNumber(f.latitude);
            const lng = toNumber(f.longitude);
            return {
              id: f.user_id,
              name: f.profiles?.display_name || 'Friend',
              avatar: f.profiles?.avatar_url,
              latitude: lat,
              longitude: lng,
            };
          })
          .filter((f) => f.latitude !== null && f.longitude !== null);

        validFriends.forEach((friend) => {
          const avatarUrl = friend.avatar || "https://github.com/shadcn.png";
          
          // Create custom circular avatar marker
          const customIcon = L.divIcon({
            className: '', // Empty class to remove default Leaflet square styles
            html: `
              <div style="
                width: 40px; 
                height: 40px; 
                border-radius: 50%; 
                border: 2px solid white; 
                background-image: url('${avatarUrl}');
                background-size: cover;
                background-position: center;
                box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                background-color: #e2e8f0;
                position: relative;
              ">
                <div style="
                  position: absolute;
                  bottom: 0;
                  right: 0;
                  width: 10px;
                  height: 10px;
                  background-color: #22c55e;
                  border: 2px solid white;
                  border-radius: 50%;
                "></div>
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
          });

          const marker = L.marker(
            [friend.latitude!, friend.longitude!],
            { icon: customIcon }
          ).addTo(map);
          
          marker.bindPopup(`<div class="font-bold text-center text-sm">${friend.name}</div>`);
          markersRef.current.push(marker);
          allPoints.push([friend.latitude!, friend.longitude!]);
        });

        // --- C. Auto-Fit Bounds (Only initially) ---
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

  // Handle window resize
  useEffect(() => {
    if (!mapRef.current) return;
    const handleResize = () => { mapRef.current.invalidateSize(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mapReady]);

  if (!isClient) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted">
        <p className="text-muted-foreground animate-pulse">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapContainerRef}
        className="h-full w-full bg-muted"
        style={{ minHeight: '100vh', zIndex: 0 }} 
      />

      {/* Loading Overlay */}
      {(!mapReady || loading) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            <span className="text-sm font-medium text-foreground">Locating you...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="absolute top-20 left-4 right-4 z-50 rounded-lg bg-destructive/90 p-3 text-center text-sm text-white shadow-lg backdrop-blur-md">
          {error}
        </div>
      )}
    </div>
  );
});

export default LeafletMap;
