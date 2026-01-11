import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, UserPlus, Calendar, Loader2, Check, X, MessageSquare, MapPin, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// --- Types ---
type NotificationItem = {
  id: string;
  type: 'friend_request' | 'event_invite' | 'message' | 'location_share' | 'story_reply';
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  event_id?: string;
  event_title?: string;
  message_preview?: string;
  share_id?: string;
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Build notifications from multiple tables
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!user) return [];
      
      const items: NotificationItem[] = [];
      const userIdsToFetch = new Set<string>();
      const eventIdsToFetch = new Set<string>();

      // 1. FETCH RAW DATA (No Joins to prevent breakage)
      
      // A. Friend Requests
      const { data: friendRequests } = await supabase
        .from("friendships")
        .select("id, created_at, requester_id")
        .eq("addressee_id", user.id)
        .eq("status", "pending");

      friendRequests?.forEach(r => userIdsToFetch.add(r.requester_id));

      // B. Event Invites
      const { data: eventInvites } = await supabase
        .from("event_invitations")
        .select("id, created_at, inviter_id, event_id")
        .eq("invitee_id", user.id)
        .eq("status", "pending");
      
      eventInvites?.forEach(i => {
        userIdsToFetch.add(i.inviter_id);
        if(i.event_id) eventIdsToFetch.add(i.event_id);
      });

      // C. Location Shares
      const { data: locationShares } = await supabase
        .from("location_shares")
        .select("id, created_at, sharer_id, expires_at")
        .eq("recipient_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString());

      locationShares?.forEach(s => userIdsToFetch.add(s.sharer_id));

      // D. Story Replies (Messages)
      const { data: messages } = await supabase
        .from("messages")
        .select("id, created_at, sender_id, content")
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .ilike("content", "Replied to story:%"); // Only story replies

      messages?.forEach(m => userIdsToFetch.add(m.sender_id));


      // 2. FETCH PROFILES & EVENTS BULK
      const profileMap = new Map();
      const eventMap = new Map();

      if (userIdsToFetch.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", Array.from(userIdsToFetch));
        
        profiles?.forEach(p => profileMap.set(p.user_id, p));
      }

      if (eventIdsToFetch.size > 0) {
        const { data: events } = await supabase
          .from("events")
          .select("id, title")
          .in("id", Array.from(eventIdsToFetch));
        
        events?.forEach(e => eventMap.set(e.id, e));
      }

      // 3. CONSTRUCT NOTIFICATIONS
      
      // Process Friend Requests
      friendRequests?.forEach((req: any) => {
        const profile = profileMap.get(req.requester_id);
        items.push({
          id: req.id,
          type: 'friend_request',
          created_at: req.created_at,
          sender_id: req.requester_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url
        });
      });

      // Process Event Invites
      eventInvites?.forEach((inv: any) => {
        const profile = profileMap.get(inv.inviter_id);
        const event = eventMap.get(inv.event_id);
        items.push({
          id: inv.id,
          type: 'event_invite',
          created_at: inv.created_at,
          sender_id: inv.inviter_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url,
          event_id: inv.event_id,
          event_title: event?.title || 'an event'
        });
      });

      // Process Location Shares
      locationShares?.forEach((share: any) => {
        const profile = profileMap.get(share.sharer_id);
        items.push({
          id: share.id,
          type: 'location_share',
          created_at: share.created_at,
          sender_id: share.sharer_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url,
          share_id: share.id
        });
      });

      // Process Story Replies
      messages?.forEach((msg: any) => {
        const profile = profileMap.get(msg.sender_id);
        items.push({
           id: msg.id,
           type: 'story_reply',
           created_at: msg.created_at,
           sender_id: msg.sender_id,
           sender_name: profile?.display_name || 'Unknown User',
           sender_avatar: profile?.avatar_url,
           message_preview: msg.content.replace('Replied to story:', '').trim()
        });
      });

      // Sort by date (newest first)
      return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user,
  });

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Friendships channel
    const friendChannel = supabase.channel('friendships-notif')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'friendships', 
        filter: `addressee_id=eq.${user.id}` 
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        toast.info("Friend list updated");
      })
      .subscribe();

    // Messages channel (for story replies)
    const msgChannel = supabase.channel('messages-notif')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `receiver_id=eq.${user.id}` 
      }, (payload: any) => {
         if (payload.new.content && payload.new.content.includes("Replied to story")) {
             toast.info("New story reply!");
             queryClient.invalidateQueries({ queryKey: ['notifications'] });
         }
      })
      .subscribe();

    // Event Invites channel
    const inviteChannel = supabase.channel('invites-notif')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'event_invitations', 
        filter: `invitee_id=eq.${user.id}` 
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        toast.info("New event invitation!");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(friendChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(inviteChannel);
    };
  }, [user, queryClient]);

  // --- Mutations ---
  const acceptFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase
        .from("friendships")
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend request accepted!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => toast.error("Failed to accept request")
  });

  const declineFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info("Request declined");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to decline request")
  });

  const acceptEventMutation = useMutation({
    mutationFn: async ({ invitationId, eventId }: { invitationId: string; eventId: string }) => {
      await supabase
        .from("event_invitations")
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq("id", invitationId);

      await supabase
        .from("event_attendees")
        .insert({ event_id: eventId, user_id: user?.id, status: 'confirmed' });
    },
    onSuccess: () => {
      toast.success("You're going to the event!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to accept invitation")
  });

  const declineEventMutation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      await supabase
        .from("event_invitations")
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq("id", invitationId);
    },
    onSuccess: () => {
      toast.info("Invitation declined");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to decline invitation")
  });

  const dismissLocationShare = useMutation({
    mutationFn: async ({ shareId }: { shareId: string }) => {
      await supabase
        .from("location_shares")
        .update({ is_active: false })
        .eq("id", shareId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'event_invite':
        return <Calendar className="w-4 h-4 text-green-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'story_reply':
        return <Reply className="w-4 h-4 text-pink-500" />;
      case 'location_share':
        return <MapPin className="w-4 h-4 text-amber-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getMessage = (item: NotificationItem) => {
    switch (item.type) {
      case 'friend_request':
        return `${item.sender_name} sent you a friend request`;
      case 'event_invite':
        return `${item.sender_name} invited you to ${item.event_title}`;
      case 'story_reply':
        return `Replying to your story: "${item.message_preview}"`;
      case 'location_share':
        return `${item.sender_name} is sharing their location with you`;
      default:
        return 'New notification';
    }
  };

  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {notifications.length} pending
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">You're all caught up!</p>
            <p className="text-sm text-muted-foreground/70 mt-1">No pending notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={item.sender_avatar} />
                    <AvatarFallback>{item.sender_name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getIcon(item.type)}
                      <span className="text-sm font-medium truncate">{item.sender_name}</span>
                    </div>
                    {/* Message Body */}
                    <p className="text-sm text-foreground mb-1">
                      {item.type === 'story_reply' ? (
                        <>
                          <span className="text-muted-foreground">Replied: </span>
                          "{item.message_preview}"
                        </>
                      ) : (
                        getMessage(item).replace(`${item.sender_name} `, '')
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {item.type === 'friend_request' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => declineFriendMutation.mutate({ friendshipId: item.id })}
                          disabled={declineFriendMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => acceptFriendMutation.mutate({ friendshipId: item.id })}
                          disabled={acceptFriendMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {item.type === 'event_invite' && item.event_id && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => declineEventMutation.mutate({ invitationId: item.id })}
                          disabled={declineEventMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => acceptEventMutation.mutate({ invitationId: item.id, eventId: item.event_id! })}
                          disabled={acceptEventMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {item.type === 'story_reply' && (
                       <Button 
                         size="sm" 
                         variant="secondary" 
                         className="h-8 px-3 text-xs"
                         onClick={() => navigate(`/app/messages?userId=${item.sender_id}`)}
                       >
                         Reply
                       </Button>
                    )}
                    {item.type === 'location_share' && item.share_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => dismissLocationShare.mutate({ shareId: item.share_id! })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
