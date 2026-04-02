import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Crosshair, MapPin, Search, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Loader2, X, 
  Globe, Layers, Radar, UserPlus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';

export default function MapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  // Location Logic (Adapted from Feed.tsx)
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading } = useLaunchZone(location?.latitude, location?.longitude);

  useEffect(() => {
    const fetchCityName = async () => {
      if (location?.latitude && location?.longitude) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`);
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.state || "Nearby";
          setLocationName(city);
        } catch (e) {
          setLocationName("Global Mode");
        }
      }
    };
    fetchCityName();
  }, [location?.latitude, location?.longitude]);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');
  const [isGhostMode, setIsGhostMode] = useState(false);

  // Determination logic for waiting room
  const cityNotDetected = !locationLoading && !launchZoneLoading && !location; 
  const showCityUnavailable = !locationLoading && !launchZoneLoading && isInLaunchZone === false;
  const isLocked = cityNotDetected || showCityUnavailable;

  // Ghost Mode Logic
  const toggleGhostMode = async () => {
    const newValue = !isGhostMode;
    await supabase.from('user_locations').upsert({ 
      user_id: user?.id, is_sharing_location: !newValue, updated_at: new Date().toISOString()
    } as any);
    setIsGhostMode(newValue);
    toast.success(newValue ? "Ghost Mode On 👻" : "Visible on Map");
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      
      {/* LAYER 1: MAP (Blurred if Locked) */}
      <div className={`absolute inset-0 z-0 h-full w-full transition-all duration-700 ${isLocked ? 'blur-xl grayscale pointer-events-none opacity-50' : ''}`}>
        <LeafletMap
          ref={mapRef}
          userLocation={location}
          friendsLocations={[]} // Add your friends mapping here
          loading={locationLoading}
          error={locationError}
          mapStyle={mapStyle} 
        />
        
        {/* Floating Controls (Top) */}
        {!isLocked && (
          <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-3 pointer-events-auto">
            <div className="flex gap-2">
              <div className="relative flex-1 h-12 bg-background/80 backdrop-blur-xl border rounded-2xl flex items-center px-4 shadow-lg">
                <Search className="w-5 h-5 text-muted-foreground mr-3" />
                <Input 
                  placeholder={`Search ${activeView}...`} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 h-full p-0 focus-visible:ring-0"
                />
              </div>
              <Button 
                onClick={toggleGhostMode}
                className={`h-12 w-12 rounded-2xl shadow-lg ${isGhostMode ? "bg-purple-600" : "bg-background/80 backdrop-blur-xl text-foreground border"}`}
              >
                {isGhostMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        )}

        {/* Recenter Button (Bottom Right) */}
        {!isLocked && (
          <div className="absolute bottom-24 right-4 z-10">
            <Button
              onClick={() => location ? mapRef.current?.recenter() : requestLocation()}
              className="rounded-full h-12 w-12 shadow-xl bg-background/90 text-primary border"
            >
              {locationLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Crosshair className="h-6 w-6" />}
            </Button>
          </div>
        )}
      </div>

      {/* LAYER 2: CENTERED WAITING UI */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/20 backdrop-blur-md">
          <div className="w-full max-w-md p-8 bg-card rounded-[2.5rem] border border-dashed border-primary/30 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              {cityNotDetected ? <Globe className="w-8 h-8 text-primary" /> : <Radar className="w-8 h-8 text-primary animate-pulse" />}
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                {cityNotDetected ? "GPS Required" : `${launchCityName || locationName} Loading...`}
              </h2>
              <p className="text-sm text-muted-foreground px-4">
                {cityNotDetected 
                  ? "We need your location to show friends and vibes nearby." 
                  : `Ahmia Map is in Stealth Mode until we reach our Pioneer goal in ${launchCityName}.`}
              </p>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white" 
              onClick={() => cityNotDetected ? window.location.reload() : navigate('/app/friends')}
            >
              {cityNotDetected ? "Retry Detection" : <><UserPlus className="w-5 h-5 mr-2" /> Invite Pioneers</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
