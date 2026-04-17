import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Users, Loader2, X, 
  Globe, Layers, Radar, CornerUpRight, Sparkles, UserPlus, Rocket,
  ShieldCheck, Flame // Added for Trust & Vibe indicators
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';

// --- Types & Constants ---
type FriendOnMap = {
  id: string;
  user_id: string;
  name: string;
  avatar?: string;
  locationLabel: string;
  coordinates?: { lat: number; lng: number } | null;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_premium?: boolean;
  user_type?: 'personal' | 'vendor'; // Added for Builder UX
  verification_status?: string;
  profiles?: { display_name?: string | null; avatar_url?: string | null } | null;
};

// ... Distance helper remains unchanged

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading, currentCount, targetCount } = useLaunchZone(location?.latitude, location?.longitude);
  const { friends = [] } = useFriends(user?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');

  // --- 1. Enhanced Discovery Logic ---
  const friendIds = useMemo(() => {
    if (!user || !friends) return [];
    return friends.map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id).filter(Boolean);
  }, [friends, user]);

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      const { data } = await supabase.from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location, updated_at')
        .in('user_id', friendIds);
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
    refetchInterval: 15000, // Faster refresh for "Friend Radar" feel
  });

  // --- 2. Process Friends with Status Indicators ---
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    return friendLocations.map(loc => {
      const friendData = friends.find((f: any) => f.requester_id === loc.user_id || f.addressee_id === loc.user_id);
      const isRequester = friendData?.requester_id === loc.user_id;
      const profile = isRequester ? friendData?.requester : friendData?.addressee;
      const dist = distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude);
      
      const isOnline = friendsPresence[loc.user_id] === 'online';

      return {
        id: loc.user_id,
        user_id: loc.user_id,
        name: profile?.display_name || 'Friend',
        avatar: profile?.avatar_url,
        coordinates: { lat: loc.latitude, lng: loc.longitude },
        status: isOnline ? 'online' : 'offline',
        lastSeen: isOnline ? 'Online now' : 'Seen recently',
        distanceKm: Number(dist.toFixed(1)),
        latitude: loc.latitude,
        longitude: loc.longitude,
        user_type: profile?.user_type || 'personal',
        verification_status: profile?.verification_status
      };
    }).sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  }, [friendLocations, friends, location, friendsPresence]);

  // --- 3. Events with "Vibe Pulse" logic ---
  const { data: events = [] } = useQuery({
    queryKey: ['events-map', location?.latitude],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('events').select('*, event_attendees(user_id, profiles(avatar_url, user_type, verification_status))');
      return data?.map((e: any) => ({
        ...e,
        distanceKm: Number(distanceKm(location.latitude, location.longitude, e.latitude || 0, e.longitude || 0).toFixed(1)),
        is_vibe: (e.event_attendees?.length || 0) > 10, // Pulse trigger
        is_verified: e.event_attendees?.some((a: any) => a.profiles?.user_type === 'vendor' && a.profiles?.verification_status === 'verified')
      })).filter(e => e.distanceKm < 50) || [];
    },
    enabled: !!location && activeView === 'events'
  });

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={!!launchCityName}
      isInLaunchZone={isInLaunchZone}
      cityName={launchCityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0}
    >
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        <div className="absolute inset-0 z-0">
          <LeafletMap
            ref={mapRef}
            userLocation={location}
            friendsLocations={activeView === 'friends' ? friendsMapped : []}
            eventLocations={activeView === 'events' ? events : []} // Passing events for pulses
            mapStyle={mapStyle} 
          />
        </div>
        
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          {/* A. Top Command Bar */}
          <div className="pt-safe-top px-4 mt-4 pointer-events-auto">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 h-12 bg-background/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg flex items-center px-4">
                  <Search className="w-5 h-5 text-muted-foreground mr-3" />
                  <Input 
                    placeholder={activeView === 'friends' ? "Friend Radar..." : "Scan for Vibes..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-0 h-full focus-visible:ring-0 p-0 text-base"
                  />
                </div>
                <Button 
                  size="icon" 
                  className={`h-12 w-12 rounded-2xl shadow-lg ${isGhostMode ? "bg-purple-600" : "bg-background/80 backdrop-blur-xl"}`}
                  onClick={() => setIsGhostMode(!isGhostMode)}
                >
                  <Radar className={`w-5 h-5 ${isGhostMode ? "text-white animate-pulse" : "text-primary"}`} />
                </Button>
              </div>

              <div className="bg-background/80 backdrop-blur-xl border border-white/10 rounded-full p-1 flex shadow-lg w-fit mx-auto">
                <button 
                  onClick={() => setActiveView('friends')}
                  className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'friends' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
                >
                  Hanging Out
                </button>
                <button 
                  onClick={() => setActiveView('events')}
                  className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'events' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
                >
                  Marketplace
                </button>
              </div>
            </div>
          </div>

          <div className="flex-grow" />

          {/* B. Dynamic Action Cards */}
          <div className="pointer-events-auto px-4 pb-24 z-[60]">
            {/* Selected Friend Card */}
            {selectedFriend && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="w-14 h-14 border-2 border-primary/20">
                          <AvatarImage src={selectedFriend.avatar} />
                          <AvatarFallback>{selectedFriend.name[0]}</AvatarFallback>
                        </Avatar>
                        {selectedFriend.status === 'online' && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-1">
                          {selectedFriend.name}
                          {selectedFriend.verification_status === 'verified' && <ShieldCheck className="w-4 h-4 text-primary" />}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Navigation className="w-3 h-3" /> {selectedFriend.distanceKm}km away • {selectedFriend.lastSeen}
                        </p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setSelectedFriend(null)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-12 rounded-xl border-primary/20" onClick={() => navigate(`/app/messages?id=${selectedFriend.id}`)}>
                      <MessageCircle className="w-4 h-4 mr-2" /> Message
                    </Button>
                    <Button className="h-12 rounded-xl gradient-primary text-white" onClick={() => mapRef.current?.recenter()}>
                      <Navigation className="w-4 h-4 mr-2" /> Meet Up
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Selected Event Card (Vibe Check) */}
            {selectedEvent && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      {selectedEvent.is_vibe && (
                        <Badge className="bg-orange-500 text-white border-0 mb-2 gap-1 animate-pulse">
                          <Flame className="w-3 h-3" /> High Vibe
                        </Badge>
                      )}
                      <h3 className="font-bold text-xl leading-tight">{selectedEvent.title}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5" /> {selectedEvent.location}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setSelectedEvent(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex -space-x-2">
                       {selectedEvent.event_attendees?.slice(0, 3).map((a: any, i: number) => (
                         <Avatar key={i} className="w-7 h-7 border-2 border-background">
                            <AvatarImage src={a.profiles?.avatar_url} />
                         </Avatar>
                       ))}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {selectedEvent.event_attendees?.length || 0} attending from your zone
                    </p>
                  </div>
                  <Button className="w-full h-12 rounded-xl gradient-primary text-white font-bold" onClick={() => navigate(`/app/events/${selectedEvent.id}`)}>
                    Join the Vibe Check
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Default Horizon Scroll (Radar) */}
            {!selectedFriend && !selectedEvent && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
                {(activeView === 'friends' ? friendsMapped : events).map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => activeView === 'friends' ? setSelectedFriend(item) : setSelectedEvent(item)}
                    className="flex-shrink-0 w-32 h-36 p-3 rounded-3xl bg-background/90 backdrop-blur-xl border border-white/10 shadow-lg flex flex-col items-center justify-center gap-2 text-center snap-start hover:scale-105 transition-transform"
                  >
                    <div className="relative">
                      <Avatar className={`w-14 h-14 ${item.is_vibe ? "ring-2 ring-orange-500 ring-offset-2 animate-pulse" : ""}`}>
                        <AvatarImage src={item.avatar || item.image_url} className="object-cover" />
                        <AvatarFallback>{item.name?.[0] || item.title?.[0]}</AvatarFallback>
                      </Avatar>
                      {item.status === 'online' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
                    </div>
                    <h4 className="font-bold text-xs truncate w-full px-1">{item.name || item.title}</h4>
                    <span className="text-[10px] text-primary font-bold">{item.distanceKm}km</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </LaunchZoneGuard>
  );
};

export default MapPage;
