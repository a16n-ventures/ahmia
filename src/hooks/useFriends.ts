import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester: Profile;
  addressee: Profile;
};

export type BlockedUser = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
};

const STALE_TIME = 30000;

// Helper to fetch profiles for friendships
async function enrichFriendshipsWithProfiles(friendships: any[]): Promise<Friendship[]> {
  if (!friendships.length) return [];
  
  const userIds = new Set<string>();
  friendships.forEach(f => {
    userIds.add(f.requester_id);
    userIds.add(f.addressee_id);
  });
  
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', Array.from(userIds));
  
  const profileMap = new Map<string, Profile>();
  (profiles || []).forEach(p => profileMap.set(p.user_id, p));
  
  return friendships.map(f => ({
    ...f,
    status: f.status as 'pending' | 'accepted' | 'declined',
    requester: profileMap.get(f.requester_id) || { user_id: f.requester_id, display_name: null, avatar_url: null },
    addressee: profileMap.get(f.addressee_id) || { user_id: f.addressee_id, display_name: null, avatar_url: null }
  }));
}

export function useFriends(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Friends (Accepted connections)
  const friendsQuery = useQuery({
    queryKey: ['friends', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return enrichFriendshipsWithProfiles(data || []);
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // Incoming requests
  const incomingQuery = useQuery({
    queryKey: ['friendRequests', 'incoming', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return enrichFriendshipsWithProfiles(data || []);
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // Outgoing requests
  const outgoingQuery = useQuery({
    queryKey: ['friendRequests', 'outgoing', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .eq('requester_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return enrichFriendshipsWithProfiles(data || []);
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // Blocked users
  const blockedQuery = useQuery({
    queryKey: ['blockedUsers', userId],
    queryFn: async (): Promise<BlockedUser[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('blocked_users')
        .select('*')
        .eq('blocker_id', userId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // Real-time subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('friend-requests-realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'friendships',
        filter: `addressee_id=eq.${userId}`
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['friendRequests', 'incoming', userId] });
        queryClient.invalidateQueries({ queryKey: ['friends', userId] });
        
        if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
          toast.info('New friend request received!');
        }
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'friendships',
        filter: `requester_id=eq.${userId}`
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['friendRequests', 'outgoing', userId] });
        queryClient.invalidateQueries({ queryKey: ['friends', userId] });
        
        if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted') {
          toast.success('Your friend request was accepted!');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Mutations
  const sendRequest = useMutation({
    mutationFn: async (targetProfile: Profile) => {
      if (!userId) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetProfile.user_id}),and(requester_id.eq.${targetProfile.user_id},addressee_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') throw new Error("Already friends!");
        if (existing.status === 'pending') throw new Error("Request already pending.");
      }

      const { data, error } = await supabase
        .from('friendships')
        .insert({ requester_id: userId, addressee_id: targetProfile.user_id, status: 'pending' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Friend request sent');
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to send request")
  });

  const acceptRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Friend added!');
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to accept request')
  });

  const rejectRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info('Request declined');
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to decline request')
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info('Request cancelled');
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to cancel request')
  });

  const removeFriend = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info('Friend removed');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to remove friend')
  });

  const blockUser = useMutation({
    mutationFn: async ({ blockedId, reason }: { blockedId: string; reason?: string }) => {
      if (!userId) throw new Error("Not authenticated");
      
      // First remove any friendship
      await supabase.from('friendships').delete()
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${blockedId}),and(requester_id.eq.${blockedId},addressee_id.eq.${userId})`);
      
      // Then block the user
      const { error } = await supabase.from('blocked_users').insert({
        blocker_id: userId,
        blocked_id: blockedId,
        reason: reason || null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('User blocked');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to block user')
  });

  const unblockUser = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase.from('blocked_users').delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('User unblocked');
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to unblock user')
  });

  const reportUser = useMutation({
    mutationFn: async ({ targetId, reason }: { targetId: string; reason: string }) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        target_id: targetId,
        target_type: 'user',
        reason,
        status: 'pending'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Report submitted. We\'ll review it shortly.');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to submit report')
  });

  return {
    friends: friendsQuery.data || [],
    incomingRequests: incomingQuery.data || [],
    outgoingRequests: outgoingQuery.data || [],
    blockedUsers: blockedQuery.data || [],
    isLoading: {
      friends: friendsQuery.isPending,
      incoming: incomingQuery.isPending,
      outgoing: outgoingQuery.isPending,
      blocked: blockedQuery.isPending,
    },
    errors: {
      friends: friendsQuery.error,
      incoming: incomingQuery.error,
      outgoing: outgoingQuery.error,
      blocked: blockedQuery.error,
    },
    mutations: {
      sendRequest,
      acceptRequest,
      rejectRequest,
      cancelRequest,
      removeFriend,
      blockUser,
      unblockUser,
      reportUser,
    }
  };
}
