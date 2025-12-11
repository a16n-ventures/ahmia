import { useEffect, useCallback } from 'react';
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

  useEffect(() => {
    if (!selectedChat || !user?.id) return;

    const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
    const filter = selectedChat.type === 'community' ? `community_id=eq.${selectedChat.id}` : undefined;

    const channel = supabase.channel(`chat_${selectedChat.id}`);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const newItem = payload.new;
          // DM Security check
          if (selectedChat.type === 'dm') {
            const isRelevant = (newItem.sender_id === user.id && newItem.receiver_id === selectedChat.partner_id)
              || (newItem.sender_id === selectedChat.partner_id && newItem.receiver_id === user.id);
            if (!isRelevant) return;
          }
          queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
          queryClient.invalidateQueries({ queryKey: ['dm_list'] });
          onMessageReceived();
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, () => {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId !== user.id) {
          onTyping({
            userId: payload.payload.userId,
            name: payload.payload.name || 'Someone',
            avatar: payload.payload.avatar
          }, true);
        }
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        if (payload.payload.userId !== user.id) {
          onTyping({
            userId: payload.payload.userId,
            name: payload.payload.name || 'Someone'
          }, false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat, user?.id, queryClient, onTyping, onMessageReceived]);

  const broadcastTyping = useCallback(async () => {
    if (!selectedChat) return;
    try {
      await supabase.channel(`chat_${selectedChat.id}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, name: userName }
      });
    } catch (e) { /* silent fail */ }
  }, [selectedChat, user?.id, userName]);

  const broadcastStopTyping = useCallback(async () => {
    if (!selectedChat) return;
    try {
      await supabase.channel(`chat_${selectedChat.id}`).send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId: user.id, name: userName }
      });
    } catch (e) { /* silent fail */ }
  }, [selectedChat, user?.id, userName]);

  return { broadcastTyping, broadcastStopTyping };
};
