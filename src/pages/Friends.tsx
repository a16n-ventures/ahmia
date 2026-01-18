import { useState, useEffect } from 'react';
import { 
  Search, UserPlus, Users, MessageCircle, MoreVertical, 
  X, Check, Loader2, Phone, Share2, Shield, UserMinus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ContactImportModal } from '@/components/ContactImportModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// --- TYPES ---
interface Friend {
  id: string;
  user_id: string; // The friend's user_id
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_online?: boolean;
  friendship_id: string; // ID of the friendship row to delete
}

interface Request {
  id: string; // Friendship ID
  requester: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
  created_at: string;
}

const Friends = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('circle');
  const [isImportOpen, setIsImportOpen] = useState(false);

  // --- 1. FETCH DATA ---
  
  // Fetch My Friends
  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['my_friends_page', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          requester:profiles!requester_id(id, user_id, display_name, username, avatar_url),
          addressee:profiles!addressee_id(id, user_id, display_name, username, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (error) throw error;

      // Transform to flat friend objects
      return data.map((f: any) => {
        const isRequester = f.requester.user_id === user.id;
        const profile = isRequester ? f.addressee : f.requester;
        return {
          id: profile.id, // Profile ID
          user_id: profile.user_id, // User ID (for chats)
          display_name: profile.display_name || 'User',
          username: profile.username || 'user',
          avatar_url: profile.avatar_url,
          friendship_id: f.id
        };
      });
    },
    enabled: !!user
  });

  // Fetch Pending Requests
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          created_at,
          requester:profiles!requester_id(id, user_id, display_name, username, avatar_url)
        `)
        .eq('addressee_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;
      return data as Request[];
    },
    enabled: !!user
  });

  // --- 2. ACTIONS ---

  const handleAccept = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend request accepted");
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
      queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
    },
    onError: () => toast.error("Failed to accept request")
  });

  const handleDecline = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request removed");
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
    },
    onError: () => toast.error("Failed to decline request")
  });

  const handleUnfriend = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from friends");
      queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
    },
    onError: () => toast.error("Failed to remove friend")
  });

  // Filter friends for search
  const filteredFriends = friends.filter(f => 
    f.display_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Friends</h1>
          <Button size="sm" variant="outline" className="rounded-full gap-2" onClick={() => setIsImportOpen(true)}>
            <UserPlus className="w-4 h-4" /> Add
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search your circle..." 
            className="pl-9 bg-muted/50 border-0 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-xl p-1 mb-6">
            <TabsTrigger value="circle" className="rounded-lg">
              My Circle ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-lg relative">
              Requests
              {requests.length > 0 && (
                <Badge className="ml-2 h-5 w-5 rounded-full px-0 flex items-center justify-center bg-red-500 hover:bg-red-600">
                  {requests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* MY CIRCLE TAB */}
          <TabsContent value="circle" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            
            {/* Import Card (Clyx Growth Feature) */}
            <div 
              className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setIsImportOpen(true)}
            >
              <div className="h-12 w-12 rounded-full bg-background flex items-center justify-center shadow-sm">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-sm">Sync Contacts</h3>
                <p className="text-xs text-muted-foreground">Find people you already know on Clyx</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
            </div>

            {loadingFriends ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredFriends.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No friends found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFriends.map(friend => (
                  <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border shadow-sm">
                    <Avatar className="h-12 w-12 cursor-pointer" onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>{friend.display_name[0]}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
                      <h4 className="font-semibold text-sm truncate">{friend.display_name}</h4>
                      <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="rounded-full h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => navigate(`/app/messages?userId=${friend.user_id}`)}
                      >
                        <MessageCircle className="w-5 h-5" />
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="rounded-full h-9 w-9 text-muted-foreground">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleUnfriend.mutate(friend.friendship_id)}>
                            <UserMinus className="w-4 h-4 mr-2" /> Unfriend
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Shield className="w-4 h-4 mr-2" /> Block
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* REQUESTS TAB */}
          <TabsContent value="requests" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            {loadingRequests ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : requests.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-2xl border-2 border-dashed">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <h3 className="font-semibold">No pending requests</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Share your profile to connect with more people.
                </p>
                <Button variant="link" className="mt-2" onClick={() => {
                   navigator.clipboard.writeText(`https://ahmia.app/${user?.id}`);
                   toast.success("Profile link copied!");
                }}>
                  <Share2 className="w-4 h-4 mr-2" /> Copy Link
                </Button>
              </div>
            ) : (
              requests.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-4 bg-card rounded-xl border shadow-sm">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={req.requester.avatar_url || undefined} />
                    <AvatarFallback>{req.requester.display_name[0]}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm">{req.requester.display_name}</h4>
                    <p className="text-xs text-muted-foreground">wants to connect</p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-9 w-9 p-0 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDecline.mutate(req.id)}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-9 w-9 p-0 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-sm"
                      onClick={() => handleAccept.mutate(req.id)}
                    >
                      <Check className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ContactImportModal open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
  );
};

export default Friends;
