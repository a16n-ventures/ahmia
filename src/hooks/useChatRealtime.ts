import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SelectedChat } from '@/types/messages';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface TypingUser {
  userId: string;
  name: string;
  avatar?: string;
}

export const useChatRealtime = (
  selectedChat: SelectedChat | null, 
  user: any, 
  onTyping: (typingUser: TypingUser, isTyping: boolean) => void,
  onMessageReceived: () => void
) => {
  const queryClient = useQueryClient();
  const userName = user?.user_metadata?.full_name || user?.email || 'Someone';

  // Refs for callbacks to prevent effect re-triggering
  const onTypingRef = useRef(onTyping);
  const onMessageReceivedRef = useRef(onMessageReceived);

  useEffect(() => {
    onTypingRef.current = onTyping;
    onMessageReceivedRef.current = onMessageReceived;
  }, [onTyping, onMessageReceived]);

  useEffect(() => {
    if (!selectedChat || !user?.id) return;

    const channelName = `chat_${selectedChat.type}_${selectedChat.id}`;
    const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
    
    // For DM, we can't easily filter by OR(sender, receiver) in string syntax, 
    // so we listen to table and filter in callback.
    // For Community, we filter by community_id.
    const filter = selectedChat.type === 'community' 
      ? `community_id=eq.${selectedChat.id}` 
      : undefined;

    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const newItem = payload.new;
          
          // Strict DM Security/Relevance check
          if (selectedChat.type === 'dm') {
            const isRelevant = 
              (newItem.sender_id === user.id && newItem.receiver_id === selectedChat.partner_id) ||
              (newItem.sender_id === selectedChat.partner_id && newItem.receiver_id === user.id);
            
            if (!isRelevant) return;
          }

          // Invalidate messages cache
          queryClient.invalidateQueries({ 
            queryKey: ['messages', selectedChat.type, selectedChat.id] 
          });
          
          // Invalidate list cache (to update last message snippet)
          if (selectedChat.type === 'dm') {
            queryClient.invalidateQueries({ queryKey: ['dm_list'] });
          }

          // Trigger scroll or notification
          if (newItem.sender_id !== user.id) {
            onMessageReceivedRef.current();
          }
        }
      )
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table, filter }, 
        () => {
          // Handle edits/deletes/reactions updates
          queryClient.invalidateQueries({ 
            queryKey: ['messages', selectedChat.type, selectedChat.id] 
          });
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        // Prevent self-echo (e.g. multiple tabs)
        if (payload.payload.userId !== user.id) {
          onTypingRef.current({
            userId: payload.payload.userId,
            name: payload.payload.name || 'Someone',
            avatar: payload.payload.avatar
          }, true);
        }
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        if (payload.payload.userId !== user.id) {
          onTypingRef.current({
            userId: payload.payload.userId,
            name: payload.payload.name || 'Someone'
          }, false);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // console.log(`Connected to chat: ${selectedChat.name}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat?.id, selectedChat?.type, user?.id, queryClient]); // Removed callbacks from dependencies

  const broadcastTyping = useCallback(async () => {
    if (!selectedChat || !user?.id) return;
    try {
      const channel = supabase.getChannels().find(c => c.topic === `chat_${selectedChat.type}_${selectedChat.id}`);
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: user.id, name: userName }
        });
      }
    } catch (e) { 
      // Silent fail for typing indicators is preferred over alerting user
      console.warn("Typing broadcast failed", e);
    }
  }, [selectedChat, user?.id, userName]);

  const broadcastStopTyping = useCallback(async () => {
    if (!selectedChat || !user?.id) return;
    try {
      const channel = supabase.getChannels().find(c => c.topic === `chat_${selectedChat.type}_${selectedChat.id}`);
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'stop_typing',
          payload: { userId: user.id, name: userName }
        });
      }
    } catch (e) { /* silent fail */ }
  }, [selectedChat, user?.id, userName]);

  return { broadcastTyping, broadcastStopTyping };
};
