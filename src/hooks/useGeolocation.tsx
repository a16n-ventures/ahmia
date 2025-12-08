// src/hooks/useGeolocation.tsx
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const LOCAL_KEY = 'last_known_location';

export const useGeolocation = () => {
  const [location, setLocation] = useState<LocationData | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchId = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const hasShownErrorRef = useRef(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      if (!hasShownErrorRef.current) {
        toast.error('Geolocation not supported.');
        hasShownErrorRef.current = true;
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    let initialLocationObtained = false;

    const saveLocal = (loc: LocationData) => {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(loc));
      } catch {
        // ignore storage quota errors
      }
    };

    const updateLastSeen = async (isOnline: boolean) => {
      if (cancelled) return;
      try {
        await supabase
          .from('user_locations')
          .update({
            is_sharing_location: isOnline,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to update last_seen:', err);
      }
    };

    const updateLocation = async (pos: GeolocationPosition) => {
      if (cancelled) return;

      const loc: LocationData = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      console.log('Location obtained:', loc);
      initialLocationObtained = true;

      setLocation(loc);
      setError(null);
      setLoading(false);
      saveLocal(loc);

      // Show success toast only once
      if (!hasShownErrorRef.current) {
        toast.success('Location access granted');
        hasShownErrorRef.current = true;
      }

      // Prevent too-frequent updates to database
      const now = Date.now();
      if (now - lastSentRef.current < 30000) return;
      lastSentRef.current = now;

      try {
        const { error } = await supabase
          .from('user_locations')
          .upsert({
            user_id: user.id,
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
            is_sharing_location: true,
            last_seen: new Date().toISOString(),
          });
        if (error) throw error;
        console.log('Location updated in database');
      } catch (err) {
        console.error('Location update error:', err);
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      
      console.warn('Geolocation error:', err.code, err.message);

      let message = 'Unable to access your location.';
      let shouldShowToast = true;

      if (err.code === 1) {
        message = 'Location permission denied. Please enable location access.';
      } else if (err.code === 2) {
        message = 'Location unavailable. Using last known location.';
        shouldShowToast = false; // Don't show toast for position unavailable
      } else if (err.code === 3) {
        message = 'Location request timed out. Using last known location.';
        // Only show timeout error if we don't have a saved location
        shouldShowToast = !location;
      }

      setError(message);
      setLoading(false);

      // Show toast only once and only for critical errors
      if (shouldShowToast && !hasShownErrorRef.current) {
        toast.error(message);
        hasShownErrorRef.current = true;
      }

      // Use cached location or fallback
      const fallback = location || { 
        latitude: 6.5244, 
        longitude: 3.3792, 
        accuracy: 1000 
      };

      if (!location) {
        setLocation(fallback);
        saveLocal(fallback);
      }

      // Mark user as offline in database
      updateLastSeen(false);
    };

    // Try to get location with progressive timeouts
    let getCurrentAttempts = 0;
    const maxGetCurrentAttempts = 2;

    const attemptGetCurrentPosition = () => {
      if (cancelled || initialLocationObtained) return;
      
      getCurrentAttempts++;
      const timeout = getCurrentAttempts === 1 ? 10000 : 5000; // 10s first try, 5s second try

      console.log(`Attempting to get location (attempt ${getCurrentAttempts}/${maxGetCurrentAttempts})...`);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateLocation(pos);
        },
        (err) => {
          if (getCurrentAttempts < maxGetCurrentAttempts && err.code === 3) {
            console.log('Retrying location request...');
            setTimeout(attemptGetCurrentPosition, 1000);
          } else {
            handleError(err);
            // Start watching even if initial request failed
            if (!cancelled && err.code !== 1) {
              startWatching();
            }
          }
        },
        {
          enableHighAccuracy: getCurrentAttempts === 1, // Try high accuracy first
          timeout: timeout,
          maximumAge: getCurrentAttempts === 1 ? 0 : 60000, // Force fresh on first try
        }
      );
    };

    const startWatching = () => {
      if (cancelled || watchId.current !== null) return;

      console.log('Starting location watch...');
      
      watchId.current = navigator.geolocation.watchPosition(
        updateLocation,
        (err) => {
          // Only log watch errors, don't show them to user
          console.warn('Watch position error:', err.code, err.message);
        },
        {
          enableHighAccuracy: false, // Use less battery for continuous tracking
          timeout: 30000, // Longer timeout for watch
          maximumAge: 120000, // Accept cached positions up to 2 minutes old
        }
      );
    };

    // Start the location acquisition process
    attemptGetCurrentPosition();

    // Mark online when component mounts
    updateLastSeen(true);

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateLastSeen(false);
      } else {
        updateLastSeen(true);
      }
    };

    const handleBeforeUnload = () => {
      updateLastSeen(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      updateLastSeen(false);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, location]);

  return { location, error, loading };
};
