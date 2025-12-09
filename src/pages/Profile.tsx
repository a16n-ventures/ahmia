import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { 
  Edit3, MapPin, Users, Camera, Bell, LogOut, Crown, Trash2,
  Loader2, Gift, Copy, Radar, BarChart3, Eye, ChevronRight,
  Shield, Check, X, Calendar, MessageSquare, Heart, Star,
  Zap, AlertCircle, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext'; // IMPORTED CONTEXT
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

// --- TYPES ---
interface ProfileData {
  user_id: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  created_at: string;
  profile_views_30d?: number;
  preferences?: {
    notifications: boolean;
    discovery_radius?: number;
  };
}

interface ProfileStats {
  friends: number;
  events: number;
  messages: number;
  event_views_30d: number;
}

// --- COMPONENT ---
const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  
  // Use Global Location Context
  const { location: currentLocation, requestLocation } = useGeolocation();

  // Local State
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [discoveryRadius, setDiscoveryRadius] = useState([5000]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // --- 1. DATA FETCHING (Optimized) ---
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['profile-full', user?.id],
    queryFn: async () => {
      if (!user) throw new Error("No user");

      // Parallel Fetching for speed
      const [profileRes, locationRes, statsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('user_locations').select('is_sharing_location').eq('user_id', user.id).maybeSingle(),
        fetchStats(user.id)
      ]);

      if (profileRes.error) throw profileRes.error;

      // Parse Preferences safely
      const prefs = profileRes.data.preferences as any || { notifications: true, discovery_radius: 5000 };

      return {
        profile: { ...profileRes.data, preferences: prefs } as ProfileData,
        locationSharing: locationRes.data?.is_sharing_location || false,
        stats: statsRes
      };
    },
    enabled: !!user,
    refetchOnWindowFocus: false, // Prevent spamming on tab switch
    staleTime: 1000 * 60 * 2, // Data is fresh for 2 mins
  });

  // Helper: Aggregated Stats Query
  const fetchStats = async (userId: string): Promise<ProfileStats> => {
    const [friends, events, messages, eventViews] = await Promise.all([
      supabase.from('friendships').select('id', { count: 'exact', head: true }).or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).eq('status', 'accepted'),
      supabase.from('event_attendees').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', userId),
      supabase.from('events').select('event_views_30d').eq('creator_id', userId)
    ]);

    const totalViews = eventViews.data?.reduce((acc, curr) => acc + (curr.event_views_30d || 0), 0) || 0;

    return {
      friends: friends.count || 0,
      events: events.count || 0,
      messages: messages.count || 0,
      event_views_30d: totalViews
    };
  };

  // Sync State with Data
  useEffect(() => {
    if (data?.profile) {
      setDisplayName(data.profile.display_name || '');
      setBio(data.profile.bio || '');
      if (data.profile.preferences?.discovery_radius) {
        setDiscoveryRadius([data.profile.preferences.discovery_radius]);
      }
    }
  }, [data]);

  // --- 2. MUTATIONS ---

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saved!');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['profile-full'] });
    },
    onError: () => toast.error('Failed to update profile')
  });

  // Location Toggle (Using Context Data)
  const toggleLocationMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      let lat = null;
      let lng = null;

      // If turning ON, ensure we have coords from Context
      if (checked) {
        if (!currentLocation) {
          // Try fetching fresh if context is empty
          await requestLocation();
          throw new Error("Getting location... try again in a second.");
        }
        lat = currentLocation.latitude;
        lng = currentLocation.longitude;
      }

      const { error } = await supabase
        .from('user_locations')
        .upsert({
          user_id: user!.id,
          is_sharing_location: checked,
          latitude: lat,
          longitude: lng,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return checked;
    },
    onSuccess: (newState) => {
      toast.success(newState ? 'Location Visible' : 'Location Hidden');
      queryClient.invalidateQueries({ queryKey: ['profile-full'] });
    },
    onError: (err) => toast.error(err.message)
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;
      await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateProfileMutation.mutateAsync({ avatar_url: publicUrl });
      return publicUrl;
    },
    onSuccess: () => {
      toast.success('Avatar updated');
      setAvatarPreview(null);
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await supabase.rpc('delete_user');
    },
    onSuccess: async () => {
      await signOut();
      navigate('/');
    }
  });

  // --- 3. HANDLERS ---

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setAvatarPreview(URL.createObjectURL(e.target.files[0]));
      uploadAvatarMutation.mutate(e.target.files[0]);
    }
  };

  const saveRadius = () => {
    // This updates the 'preferences' JSON column which the AI uses for filtering
    const newPrefs = { 
      ...data?.profile.preferences, 
      discovery_radius: discoveryRadius[0] 
    };
    updateProfileMutation.mutate({ preferences: newPrefs });
  };

  const calculateCompletion = () => {
    if (!data?.profile) return 0;
    let score = 0;
    if (data.profile.display_name) score += 20;
    if (data.profile.bio?.length > 10) score += 20;
    if (data.profile.avatar_url) score += 20;
    if (data.locationSharing) score += 20;
    if (data.stats.friends > 0) score += 20;
    return score;
  };

  const completion = calculateCompletion();

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pb-24">
      
      {/* HEADER */}
      <div className="relative gradient-primary text-white pb-12 pt-6 rounded-b-[2.5rem] shadow-xl overflow-hidden">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
        <div className="container-mobile relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 rounded-full" onClick={() => refetch()}>
                <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-white hover:bg-white/20 rounded-full font-semibold px-4"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Done' : 'Edit'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="w-28 h-28 border-4 border-white/30 shadow-2xl ring-4 ring-white/10">
                <AvatarImage src={avatarPreview || data?.profile.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-white/20 text-2xl font-bold">
                  {data?.profile.display_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 p-2 bg-white text-primary rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform">
                <Camera className="w-4 h-4" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarSelect} />
              </label>
            </div>
            
            <div className="flex-1 space-y-1">
              {isEditing ? (
                <Input 
                  value={displayName} 
                  onChange={e => setDisplayName(e.target.value)} 
                  className="bg-white/20 border-white/30 text-white placeholder:text-white/50" 
                  placeholder="Your Name"
                />
              ) : (
                <h2 className="text-2xl font-bold">{data?.profile.display_name}</h2>
              )}
              <p className="text-sm opacity-90">{user?.email}</p>
              <Badge className="bg-amber-400/20 text-amber-100 border-amber-400/30 mt-2">
                <Crown className="w-3 h-3 mr-1" /> Free Member
              </Badge>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex justify-between text-sm mb-2 font-medium">
              <span>Profile Strength</span>
              <span>{completion}%</span>
            </div>
            <Progress value={completion} className="h-2 bg-black/20" indicatorClassName="bg-white" />
          </div>
        </div>
      </div>

      {/* BODY CONTENT */}
      <div className="container-mobile -mt-6 relative z-10 space-y-5">
        
        {/* ANALYTICS CARD */}
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-5 border-b bg-muted/30">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Live Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 divide-x p-0">
            <div className="p-6 text-center hover:bg-muted/10 transition-colors">
              <div className="text-3xl font-bold text-foreground mb-1">{data?.profile.profile_views_30d || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Eye className="w-3 h-3" /> Profile Views
              </div>
            </div>
            <div className="p-6 text-center hover:bg-muted/10 transition-colors">
              <div className="text-3xl font-bold text-foreground mb-1">{data?.stats.event_views_30d || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Radar className="w-3 h-3" /> Event Reach
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QUICK STATS */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Friends', val: data?.stats.friends, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { label: 'Events', val: data?.stats.events, icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-500/10' },
            { label: 'Messages', val: data?.stats.messages, icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-500/10' }
          ].map((s, i) => (
            <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-4 flex flex-col items-center justify-center h-24">
                <div className={`p-2 rounded-full mb-2 ${s.bg} ${s.color}`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <span className="font-bold text-lg">{s.val}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{s.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* BIO EDITOR */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" /> About Me
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea 
                  value={bio} 
                  onChange={e => setBio(e.target.value)} 
                  className="bg-muted/30" 
                  placeholder="Tell us about yourself..." 
                  maxLength={200}
                />
                <Button size="sm" className="w-full" onClick={() => updateProfileMutation.mutate({ bio })}>Save Bio</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {data?.profile.bio || "No bio yet. Tap 'Edit' to add one!"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* SETTINGS */}
        <div className="space-y-3 pb-10">
          <h3 className="text-xs font-bold text-muted-foreground uppercase ml-1">Settings</h3>
          <Card className="border-0 shadow-sm divide-y">
            
            {/* Discovery Radius */}
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-3">
                  <div className="p-2 bg-green-100 text-green-600 rounded-lg"><Radar className="w-5 h-5" /></div>
                  <div>
                    <div className="text-sm font-semibold">Discovery Radius</div>
                    <div className="text-xs text-muted-foreground">Max: {(discoveryRadius[0] / 1000).toFixed(1)}km</div>
                  </div>
                </div>
              </div>
              <Slider 
                value={discoveryRadius} 
                onValueChange={setDiscoveryRadius} 
                onValueCommit={saveRadius} 
                max={50000} step={1000} 
              />
            </div>

            {/* Location Toggle */}
            <div className="p-4 flex justify-between items-center">
              <div className="flex gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><MapPin className="w-5 h-5" /></div>
                <div>
                  <div className="text-sm font-semibold">Location Sharing</div>
                  <div className="text-xs text-muted-foreground">Visible on map</div>
                </div>
              </div>
              <Switch 
                checked={data?.locationSharing} 
                onCheckedChange={(c) => toggleLocationMutation.mutate(c)} 
                disabled={toggleLocationMutation.isPending}
              />
            </div>

            {/* Notifications */}
            <div className="p-4 flex justify-between items-center">
              <div className="flex gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Bell className="w-5 h-5" /></div>
                <div>
                  <div className="text-sm font-semibold">Notifications</div>
                  <div className="text-xs text-muted-foreground">Push alerts</div>
                </div>
              </div>
              <Switch 
                checked={data?.profile.preferences?.notifications} 
                onCheckedChange={(c) => {
                  const newPrefs = { ...data?.profile.preferences, notifications: c };
                  updateProfileMutation.mutate({ preferences: newPrefs });
                }} 
              />
            </div>

            {/* Logout / Delete */}
            <div className="p-2">
              <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            </div>
          </Card>

          <div className="text-center pt-6">
            <p className="text-xs text-muted-foreground">Lynq App v1.2.0</p>
            <Button variant="link" className="text-xs text-red-400 h-auto p-0 mt-2" onClick={() => setShowDeleteDialog(true)}>
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Delete Account Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. You will lose all friends, events, and messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteAccountMutation.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Profile;
