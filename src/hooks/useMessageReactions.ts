import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Reaction {
  emoji: string;
  count: number;
  users: string[]; // Store user IDs to check if "me" reacted
  hasReacted: boolean;
}

export interface MessageReactions {
  [messageId: string]: Reaction[];
}

export function useMessageReactions(
  messageIds: string[],
  userId: string | undefined,
  isComm: boolean = false
) {
  const queryClient = useQueryClient();
  const tableName = isComm ? 'community_message_reactions' : 'message_reactions';
  
  // Stable key for cache - sort IDs to prevent unnecessary refetches if order changes
  const queryKey = ['messageReactions', isComm, messageIds.slice().sort().join(',')];

  const reactionsQuery = useQuery({
    queryKey: queryKey,
    queryFn: async (): Promise<MessageReactions> => {
      if (!messageIds.length) return {};

      const { data, error } = await supabase
        .from(tableName)
        .select('id, message_id, user_id, emoji')
        .in('message_id', messageIds);

      if (error) throw error;

      const reactions: MessageReactions = {};
      
      // Initialize arrays
      messageIds.forEach(id => { reactions[id] = []; });

      (data || []).forEach(r => {
        if (!reactions[r.message_id]) reactions[r.message_id] = [];
        
        const existing = reactions[r.message_id].find(e => e.emoji === r.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(r.user_id);
          if (r.user_id === userId) {
            existing.hasReacted = true;
          }
        } else {
          reactions[r.message_id].push({
            emoji: r.emoji,
            count: 1,
            users: [r.user_id],
            hasReacted: r.user_id === userId
          });
        }
      });

      return reactions;
    },
    enabled: messageIds.length > 0 && !!userId,
    staleTime: 30000, // Keep fresh for 30s unless invalidated
  });

  // Real-time subscription
  useEffect(() => {
    if (!messageIds.length || !userId) return;

    // Filter for changes only relevant to these messages
    const channel = supabase
      .channel(`reactions-${isComm ? 'comm' : 'dm'}-${messageIds.slice(0, 1).join('')}`) // simpler channel name
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `message_id=in.(${messageIds.join(',')})` // Server-side filtering if supported, else client filter
        },
        () => {
          // Debounce invalidation could be added here if high traffic
          queryClient.invalidateQueries({ queryKey: queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageIds.length, isComm, tableName, queryClient]); // Removed deep dependency on messageIds.join

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error("Not authenticated");

      // 1. Try to insert (Add Reaction)
      const { error } = await supabase
        .from(tableName)
        .insert({ message_id: messageId, user_id: userId, emoji });

      if (error) {
        // 2. If unique violation (23505), it means we already reacted -> Delete (Remove Reaction)
        if (error.code === '23505') {
          const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('emoji', emoji);
            
          if (deleteError) throw deleteError;
          return 'removed';
        } else {
          throw error;
        }
      }
      return 'added';
    },
    
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey });

      const previousReactions = queryClient.getQueryData<MessageReactions>(queryKey);

      queryClient.setQueryData<MessageReactions>(queryKey, (old) => {
        if (!old) return old;
        const newReactions = { ...old };
        
        // Ensure array exists
        const msgReactions = [...(newReactions[messageId] || [])];
        const existingIdx = msgReactions.findIndex(r => r.emoji === emoji);

        if (existingIdx >= 0) {
          const existing = { ...msgReactions[existingIdx] };
          if (existing.hasReacted) {
            // Optimistic Remove
            existing.count--;
            existing.hasReacted = false;
            existing.users = existing.users.filter(u => u !== userId);
            
            if (existing.count <= 0) {
              msgReactions.splice(existingIdx, 1);
            } else {
              msgReactions[existingIdx] = existing;
            }
          } else {
            // Optimistic Add (to existing emoji group)
            existing.count++;
            existing.hasReacted = true;
            existing.users = [...existing.users, userId!];
            msgReactions[existingIdx] = existing;
          }
        } else {
          // Optimistic Create (new emoji group)
          msgReactions.push({
            emoji,
            count: 1,
            users: [userId!],
            hasReacted: true
          });
        }
        
        newReactions[messageId] = msgReactions;
        return newReactions;
      });

      return { previousReactions };
    },
    
    onError: (_, __, context) => {
      if (context?.previousReactions) {
        queryClient.setQueryData(queryKey, context.previousReactions);
      }
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    reactions: reactionsQuery.data || {},
    isLoading: reactionsQuery.isPending,
    addReaction: addReaction.mutate,
    isAddingReaction: addReaction.isPending,
  };
}
