import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { 
  Search, Send, ArrowLeft, Plus, Settings, Users, 
  MessageSquare, X, Loader2, 
  MoreVertical, Info, Image as ImageIcon, Grid, Pin, ChevronDown, ChevronUp, Upload, Shield, Forward,
  CheckCircle2
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useFriends } from "@/hooks/useFriends";

// Import components
import { ChatMode, SelectedChat, Message, DMListItem, CommunityListItem } from '@/types/messages';
import { validateImage, formatTime } from '@/utils/messageHelpers';
import { useScrollToBottom } from '@/hooks/useScrollToBottom';
import { useChatRealtime } from '@/hooks/useChatRealtime';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { MediaGallery } from '@/components/messages/MediaGallery';
import { CommunityInfoDialog } from '@/components/messages/CommunityInfoDialog';
import { CommunitySettingsDialog } from '@/components/messages/CommunitySettingsDialog';
import { CommunityModerationDialog } from '@/components/messages/CommunityModerationDialog';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { EmojiPicker } from '@/components/messages/EmojiPicker';

// --- Types & Helpers ---
type ExtendedSelectedChat = SelectedChat & { is_premium?: boolean };
type ExtendedDMListItem = DMListItem & { is_premium?: boolean };

const getDisplayName = (profile: any): string => {
  if (!profile) return 'Unknown User';
  const p = Array.isArray(profile) ? profile[0] : profile;
  if (!p) return 'Unknown User';
  return p.display_name?.trim() || p.username?.trim() || p.email?.split('@')[0] || 'Unknown User';
};

// Restored Verification Badge
const VerificationBadge = () => (
  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1 fill-blue-500/10" />
);

export default function Messages() {
  const [hasError, setHasError] = useState(false);
  const { user } = useAuth() || {};
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<ChatMode>('dm');
  const [selectedChat, setSelectedChat] = useState<ExtendedSelectedChat | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Dialog States
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModerationOpen, setIsModerationOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);
  
  // Create community state
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [newCommCoverFile, setNewCommCoverFile] = useState<File | null>(null);
  const [newCommCoverPreview, setNewCommCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // --- Derived State ---
  const currentUser = useMemo(() => ({
    id: user?.id,
    email: user?.email,
    user_metadata: { full_name: user?.user_metadata?.full_name }
  }), [user]);

  // Debounce Search
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  // --- Hooks ---
  const { typingUsers, handleTypingUpdate, clearTyping } = useTypingIndicator();
  const { broadcastTyping, broadcastStopTyping } = useChatRealtime(
    selectedChat, currentUser, handleTypingUpdate, () => {}
  );

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Caught error in Messages:', error);
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  useEffect(() => clearTyping(), [selectedChat?.id]);

  // --- Data Queries ---

  // 1. DM List
  const { data: dmList = [], isLoading: loadingDMs } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async (): Promise<ExtendedDMListItem[]> => {
      if (!user?.id) return [];
      const { data: messages } = await supabase.from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (!messages?.length) return [];

      const partnerMap = new Map();
      messages.forEach((msg: any) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            last_msg: msg.content ?? (msg.image_url ? '📷 Photo' : 'Message'),
            time: msg.created_at,
            unread: 0
          });
        }
        if (msg.receiver_id === user.id && !msg.is_read) {
          partnerMap.get(partnerId).unread++;
        }
      });

      const partnerIds = Array.from(partnerMap.keys());
      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', partnerIds);
      
      // Fetch Premium Status
      const { data: premium } = await supabase.from('premium_features')
        .select('user_id')
        .in('user_id', partnerIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());
      
      const premiumSet = new Set(premium?.map(p => p.user_id));

      return partnerIds.map(pid => {
        const profile = profiles?.find((p: any) => p.user_id === pid);
        const details = partnerMap.get(pid);
        return {
          type: 'dm',
          id: pid,
          partner_id: pid,
          name: getDisplayName(profile),
          avatar: profile?.avatar_url,
          last_msg: details.last_msg,
          time: details.time,
          is_online: false, 
          unread_count: details.unread,
          is_premium: premiumSet.has(pid)
        };
      });
    },
    enabled: !!user?.id,
    refetchInterval: 10000 
  });

  // 2. Communities List
  const { data: commList = [], isLoading: loadingComms } = useQuery({
    queryKey: ['comm_list', user?.id],
    queryFn: async (): Promise<CommunityListItem[]> => {
      if (!user?.id) return [];
      const { data: communities } = await supabase.from('communities')
        .select(`*, community_members ( count )`)
        .order('created_at', { ascending: false });

      if (!communities) return [];

      const { data: memberships } = await supabase.from('community_members')
        .select('community_id, role').eq('user_id', user.id);
      
      const roleMap = new Map(memberships?.map((m: any) => [m.community_id, m.role]));

      return communities.map((c: any) => ({
        type: 'community',
        id: c.id,
        name: c.name,
        description: c.description,
        cover_url: c.cover_url,
        avatar: c.cover_url,
        member_count: c.community_members?.[0]?.count || 0,
        my_role: (roleMap.get(c.id) || 'none') as any,
        is_joined: roleMap.has(c.id)
      }));
    },
    enabled: !!user?.id
  });

  // 3. Messages for Selected Chat
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', selectedChat?.type, selectedChat?.id],
    queryFn: async (): Promise<Message[]> => {
      if (!user?.id || !selectedChat) return [];
      
      if (selectedChat.type === 'dm') {
        const { data } = await supabase.from('messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });

        // Mark as read
        if (data?.some((m: any) => m.receiver_id === user.id && !m.is_read)) {
          supabase.from('messages').update({ is_read: true })
            .eq('sender_id', selectedChat.partner_id).eq('receiver_id', user.id).eq('is_read', false).then(() => {
              queryClient.invalidateQueries({ queryKey: ['dm_list'] });
            });
        }
        
        return (data || []).map((m: any) => ({
          ...m,
          is_me: m.sender_id === user.id,
          sender_name: m.sender_id === user.id ? 'You' : selectedChat.name,
          sender_avatar: m.sender_id === user.id ? undefined : selectedChat.avatar,
          read: m.is_read,
          reply_to: null // DM replies handled simply
        }));
      } else {
        // Fetch Community Messages
        const { data } = await supabase.from('community_messages')
          .select(`*, sender:profiles!sender_id(*), reply_to:community_messages!reply_to_id(id, content, sender_id, image_url)`)
          .eq('community_id', selectedChat.id)
          .order('created_at', { ascending: true });

        return (data || []).map((m: any) => {
          // STRICT REPLY CHECK: Ensure reply_to is valid
          const validReply = m.reply_to && m.reply_to.id ? { ...m.reply_to, sender_id: m.reply_to.sender_id } : null;
          
          return {
            ...m,
            is_me: m.sender_id === user.id,
            sender_name: getDisplayName(m.sender),
            sender_avatar: Array.isArray(m.sender) ? m.sender[0]?.avatar_url : m.sender?.avatar_url,
            reply_to: validReply
          };
        });
      }
    },
    enabled: !!selectedChat
  });

  const { scrollRef, scrollToBottom } = useScrollToBottom(messages);

  // 4. Friends
  const { friends: rawFriends = [] } = useFriends(user?.id);
  const friends = useMemo(() => {
    return rawFriends.map((f: any) => {
      const isRequester = f.requester_id === user?.id;
      const profile = isRequester ? f.addressee : f.requester;
      const id = isRequester ? f.addressee_id : f.requester_id;
      
      // Check if user is verified/premium (Mock or from profile data if available)
      // Assuming 'is_verified' might be in metadata or we check a separate list
      // For now, let's map it if available in profile
      return {
        id,
        name: getDisplayName(Array.isArray(profile) ? profile[0] : profile),
        avatar: (Array.isArray(profile) ? profile[0] : profile)?.avatar_url,
        is_online: false,
        is_verified: (Array.isArray(profile) ? profile[0] : profile)?.is_verified || false 
      };
    }).filter(Boolean);
  }, [rawFriends, user?.id]);

  const filteredFriends = useMemo(() => {
    if (!friendSearch) return friends;
    return friends.filter(f => f.name.toLowerCase().includes(friendSearch.toLowerCase()));
  }, [friends, friendSearch]);


  // --- Mutations ---
  const sendMessage = useMutation({
    mutationFn: async (vars: { content: string | null; file: File | null; targetChat?: ExtendedSelectedChat }) => {
      const target = vars.targetChat || selectedChat;
      if (!target || !user) throw new Error("No target chat");

      let imageUrl: string | null = null;
      if (vars.file) {
        const fileExt = vars.file.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: upErr } = await supabase.storage.from('chat-attachments').upload(filePath, vars.file);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        imageUrl = data.publicUrl;
      }

      const payload: any = {
        sender_id: user.id,
        content: vars.content || null,
        image_url: imageUrl,
      };

      if (target.type === 'dm') {
        payload.receiver_id = target.partner_id;
        payload.is_read = false;
        await supabase.from('messages').insert(payload);
      } else {
        payload.community_id = target.id;
        // Only attach reply if we are actually replying
        if (replyingTo && !vars.targetChat) {
           payload.reply_to_id = replyingTo.id;
        }
        await supabase.from('community_messages').insert(payload);
      }
    },
    onSuccess: () => {
      setMessageInput('');
      setImageFile(null);
      setImagePreview(null);
      setReplyingTo(null);
      scrollToBottom();
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['dm_list'] });
    },
    onError: (e) => toast.error(`Failed to send: ${e.message}`)
  });

  const deleteMessage = useMutation({
    mutationFn: async (msgId: string) => {
      const table = selectedChat?.type === 'dm' ? 'messages' : 'community_messages';
      await supabase.from(table).update({ is_deleted: true, content: null, image_url: null }).eq('id', msgId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] })
  });

  const editMessage = useMutation({
    mutationFn: async ({ msg, newContent }: { msg: Message, newContent: string }) => {
      const table = selectedChat?.type === 'dm' ? 'messages' : 'community_messages';
      await supabase.from(table).update({ content: newContent, updated_at: new Date().toISOString() }).eq('id', msg.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] })
  });

  const pinMessage = useMutation({
    mutationFn: async (msg: Message) => {
       await supabase.from('community_messages').update({ is_pinned: !msg.is_pinned }).eq('id', msg.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] })
  });

  const joinCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id, role: 'member' });
      if (error) throw error;
      await supabase.rpc('increment_community_members', { community_id: communityId });
    },
    onSuccess: () => {
      toast.success("Joined community!");
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to join community")
  });

  const createCommunity = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!newCommName.trim()) throw new Error("Community name is required");
  
      let coverUrl: string | null = null;
      if (newCommCoverFile) {
        const fileExt = newCommCoverFile.name.split('.').pop();
        const filePath = `community-covers/${user.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, newCommCoverFile);
        if (uploadError) throw new Error("Failed to upload cover image");
        const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        coverUrl = urlData.publicUrl;
      }
  
      const { data: comm, error } = await supabase.from('communities')
        .insert({ 
          name: newCommName.trim(), 
          description: newCommDesc.trim(), 
          creator_id: user.id, 
          member_count: 1,
          cover_url: coverUrl
        }).select().single();
      
      if (error) throw error;
      await supabase.from('community_members').insert({ community_id: comm.id, user_id: user.id, role: 'admin' });
      return comm;
    },
    onSuccess: () => {
      setIsCreateCommunityOpen(false);
      setNewCommName('');
      setNewCommDesc('');
      setNewCommCoverFile(null);
      setNewCommCoverPreview(null);
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community created successfully!");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create community")
  });

  // --- Handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
       const err = validateImage(file);
       if(err) return toast.error(err);
       setImageFile(file);
       setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSendMessage = () => {
    if ((messageInput.trim() || imageFile) && !sendMessage.isPending) {
      sendMessage.mutate({ content: messageInput.trim(), file: imageFile });
    }
  };

  // Reactions
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { reactions, addReaction } = useMessageReactions(messageIds, user?.id, selectedChat?.type === 'community');

  // Roles & Permissions
  const myRole = selectedChat?.type === 'community' ? selectedChat.my_role : 'none';
  const isAdmin = myRole === 'admin';
  const canModerate = isAdmin || myRole === 'moderator';
  const canType = selectedChat?.type === 'dm' || (selectedChat?.type === 'community' && myRole !== 'none');

  if (hasError) return <div className="p-4 text-center">Something went wrong. Please reload.</div>;

  // --- Render ---
  
  // 1. Chat View
  if (selectedChat) {
    const pinnedMessages = messages.filter(m => m.is_pinned && !m.is_deleted);
    const chatImages = messages.filter(m => m.image_url && !m.is_deleted).map(m => ({ url: m.image_url!, id: m.id }));

    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col h-[100dvh]">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-3 bg-background/95 backdrop-blur z-10">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full" onClick={() => setSelectedChat(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <Avatar className="h-10 w-10 border cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <AvatarImage src={selectedChat.avatar} />
            <AvatarFallback>{selectedChat.name?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <div className="flex items-center gap-1">
              <h3 className="font-bold text-sm truncate">{selectedChat.name}</h3>
              {selectedChat.is_premium && <VerificationBadge />}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {selectedChat.type === 'community' ? `${selectedChat.member_count} members` : 'Tap for info'}
            </p>
          </div>

          <div className="flex items-center gap-1">
             <Button variant="ghost" size="icon" onClick={() => setIsGalleryOpen(true)}>
                <Grid className="w-5 h-5" />
             </Button>
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon"><MoreVertical className="w-5 h-5" /></Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                 <DropdownMenuItem onClick={() => setIsInfoOpen(true)}>
                    <Info className="w-4 h-4 mr-2" /> Info
                 </DropdownMenuItem>
                 {isAdmin && (
                   <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                     <Settings className="w-4 h-4 mr-2" /> Settings
                   </DropdownMenuItem>
                 )}
                 {canModerate && (
                    <DropdownMenuItem onClick={() => setIsModerationOpen(true)}>
                      <Shield className="w-4 h-4 mr-2" /> Moderation
                    </DropdownMenuItem>
                 )}
               </DropdownMenuContent>
             </DropdownMenu>
          </div>
        </div>

        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <div className="border-b bg-muted/30">
             <button 
               onClick={() => setShowPinnedMessages(!showPinnedMessages)}
               className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-primary"
             >
               <div className="flex items-center gap-2">
                 <Pin className="w-3.5 h-3.5 fill-current" />
                 <span>{pinnedMessages.length} Pinned</span>
               </div>
               {showPinnedMessages ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
             </button>
             {showPinnedMessages && (
               <div className="px-4 pb-2 space-y-2 max-h-32 overflow-y-auto bg-background/50">
                 {pinnedMessages.map(m => (
                   <div key={m.id} onClick={() => { /* scroll to */ }} className="p-2 bg-background border rounded-md cursor-pointer text-xs truncate">
                     {m.content || 'Photo'}
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 scroll-smooth" ref={scrollRef}>
          <div className="space-y-4 pb-2">
            {messages.map((m, i) => (
              <MessageBubble 
                key={m.id} 
                msg={m} 
                prevMsg={i > 0 ? messages[i-1] : null} 
                isComm={selectedChat.type === 'community'}
                canModerate={canModerate}
                onDelete={(id) => deleteMessage.mutate(id)}
                onReply={setReplyingTo}
                onEdit={(msg, content) => editMessage.mutateAsync({ msg, newContent: content })}
                onPin={canModerate ? (msg) => pinMessage.mutate(msg) : undefined}
                scrollToId={scrollToId}
                onForward={(msg) => setForwardingMsg(msg)}
                onReact={(id, emoji) => addReaction({ messageId: id, emoji })}
                reactions={reactions[m.id] || []}
              />
            ))}
            <TypingIndicator typingUsers={typingUsers} showAvatars={selectedChat.type === 'community'} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 border-t bg-background shrink-0">
          {canType ? (
            <div className="flex flex-col gap-2">
              {/* Replying Banner - NOW FIXED */}
              {replyingTo && (
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border-l-4 border-primary animate-in slide-in-from-bottom-2">
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="font-semibold text-primary block">Replying to {replyingTo.sender_name}</span>
                    <span className="text-muted-foreground truncate block">{replyingTo.content || 'Photo'}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setReplyingTo(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Image Preview */}
              {imagePreview && (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border group">
                  <img src={imagePreview} className="w-full h-full object-cover" alt="preview" />
                  <button 
                    onClick={() => { 
                      setImageFile(null); 
                      URL.revokeObjectURL(imagePreview);
                      setImagePreview(null); 
                    }}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Input Row */}
              <div className="flex items-end gap-2">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon className="w-5 h-5" />
                </Button>
                
                {/* Emoji Picker - FIXED Integration */}
                <EmojiPicker 
                   isOpen={showEmojiPicker} 
                   onOpenChange={setShowEmojiPicker}
                   onSelect={(emoji) => setMessageInput(prev => prev + emoji)}
                />

                <Textarea 
                  value={messageInput}
                  onChange={e => {
                     setMessageInput(e.target.value);
                     if (!typingTimeoutRef.current) broadcastTyping();
                     clearTimeout(typingTimeoutRef.current!);
                     typingTimeoutRef.current = window.setTimeout(broadcastStopTyping, 3000);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="min-h-[44px] max-h-32 py-3 resize-none rounded-2xl bg-muted/50 border-transparent focus:bg-background focus:border-primary/30"
                  rows={1}
                />
                
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!messageInput.trim() && !imageFile}
                  size="icon" 
                  className="rounded-full shrink-0"
                >
                  {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ) : (
             <div className="flex flex-col items-center gap-2 py-2">
               <p className="text-sm text-muted-foreground">Join to start chatting</p>
               <Button onClick={() => joinCommunity.mutate(selectedChat.id)}>Join Community</Button>
             </div>
          )}
        </div>

        {/* Dialogs */}
        <MediaGallery isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} images={chatImages} />
        {selectedChat.type === 'community' && (
           <>
             <CommunityInfoDialog isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} community={selectedChat} coverUrl={selectedChat.cover_url} />
             <CommunitySettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} communityId={selectedChat.id} currentName={selectedChat.name} currentDesc={selectedChat.description || ''} currentCoverUrl={selectedChat.cover_url} />
             {canModerate && <CommunityModerationDialog isOpen={isModerationOpen} onClose={() => setIsModerationOpen(false)} communityId={selectedChat.id} communityName={selectedChat.name} myRole={myRole} />}
           </>
        )}

        {/* Forward Dialog */}
        <Dialog open={!!forwardingMsg} onOpenChange={(open) => !open && setForwardingMsg(null)}>
           <DialogContent className="sm:max-w-md">
             <DialogHeader>
               <DialogTitle>Forward Message</DialogTitle>
               <DialogDescription>Select a chat to forward this message to</DialogDescription>
             </DialogHeader>
             <div className="max-h-[300px] overflow-y-auto space-y-2 py-2">
                {dmList.map(dm => (
                   <div key={dm.id} onClick={() => forwardMessage(dm)} className="flex items-center gap-3 p-2 hover:bg-muted rounded-lg cursor-pointer">
                      <Avatar className="w-10 h-10"><AvatarImage src={dm.avatar} /><AvatarFallback>{dm.name[0]}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{dm.name}</span>
                      <Forward className="w-4 h-4 ml-auto text-muted-foreground" />
                   </div>
                ))}
             </div>
           </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 2. Main List View
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl p-4 border-b">
         <div className="flex items-center justify-between mb-4">
           <h1 className="text-2xl font-bold">Messages</h1>
           {/* Context-Aware Create Button - FIXED */}
           <Button size="icon" variant="ghost" className="rounded-full" onClick={() => activeTab === 'dm' ? setIsNewChatOpen(true) : setIsCreateCommunityOpen(true)}>
             <Plus className="w-6 h-6" />
           </Button>
         </div>
         <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
           <Input 
             value={searchQuery} 
             onChange={e => setSearchQuery(e.target.value)}
             placeholder="Search conversations..." 
             className="pl-9 bg-muted/50 border-none rounded-xl" 
           />
         </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatMode)} className="p-4">
         <TabsList className="w-full grid grid-cols-2 mb-4">
           <TabsTrigger value="dm">Direct Messages</TabsTrigger>
           <TabsTrigger value="community">Communities</TabsTrigger>
         </TabsList>
         
         <TabsContent value="dm" className="space-y-2">
            {loadingDMs ? <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : 
             dmList.filter(d => d.name.toLowerCase().includes(debouncedSearch.toLowerCase())).map(dm => (
               <div key={dm.id} onClick={() => setSelectedChat(dm)} className="flex items-center gap-4 p-3 hover:bg-muted/50 rounded-xl cursor-pointer transition-colors">
                  <div className="relative">
                     <Avatar className="w-12 h-12 border"><AvatarImage src={dm.avatar} /><AvatarFallback>{dm.name[0]}</AvatarFallback></Avatar>
                     {/* Unread Badge */}
                     {dm.unread_count > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">{dm.unread_count}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                     <div className="flex justify-between items-center mb-0.5">
                        <span className="font-semibold text-sm truncate flex items-center gap-1">
                          {dm.name}
                          {dm.is_premium && <VerificationBadge />}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(dm.time)}</span>
                     </div>
                     <p className={`text-sm truncate ${dm.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {dm.last_msg}
                     </p>
                  </div>
               </div>
             ))}
         </TabsContent>

         <TabsContent value="community" className="space-y-2">
            {/* Inline button removed as requested, handled by top header button */}
            {loadingComms ? <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> :
             commList.filter(c => c.name.toLowerCase().includes(debouncedSearch.toLowerCase())).map(c => (
               <div key={c.id} onClick={() => setSelectedChat(c)} className="flex items-center gap-4 p-3 hover:bg-muted/50 rounded-xl cursor-pointer transition-colors">
                  <Avatar className="w-12 h-12 rounded-lg border"><AvatarImage src={c.cover_url} /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                     <h3 className="font-semibold text-sm truncate flex items-center gap-1">
                        {c.name}
                        {c.my_role !== 'none' && <Badge variant="secondary" className="text-[10px] h-4 px-1">{c.my_role}</Badge>}
                     </h3>
                     <p className="text-xs text-muted-foreground">{c.member_count} members</p>
                  </div>
                  <Button size="sm" variant={c.is_joined ? "ghost" : "default"}>
                     {c.is_joined ? "Open" : "Join"}
                  </Button>
               </div>
             ))}
         </TabsContent>
      </Tabs>

      {/* New Chat Modal - Headers Restored */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
         <DialogContent className="sm:max-w-md h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-4 border-b">
               <DialogTitle>New Message</DialogTitle>
               <DialogDescription className="hidden">Select a friend to message</DialogDescription>
               <Input 
                  placeholder="Search friends..." 
                  value={friendSearch}
                  onChange={e => setFriendSearch(e.target.value)}
                  className="mt-2"
               />
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-2">
               {filteredFriends.length === 0 ? <p className="text-center text-muted-foreground py-8">No friends found</p> :
                filteredFriends.map(f => (
                   <div key={f.id} onClick={() => {
                      setSelectedChat({ type: 'dm', id: f.id, partner_id: f.id, name: f.name, avatar: f.avatar, is_premium: f.is_verified });
                      setIsNewChatOpen(false);
                   }} className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg cursor-pointer">
                      <Avatar><AvatarImage src={f.avatar} /><AvatarFallback>{f.name[0]}</AvatarFallback></Avatar>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{f.name}</span>
                        {f.is_verified && <VerificationBadge />}
                      </div>
                   </div>
                ))}
            </div>
         </DialogContent>
      </Dialog>
      
      {/* Create Community Modal - Headers Restored */}
      <Dialog open={isCreateCommunityOpen} onOpenChange={setIsCreateCommunityOpen}>
         <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Community</DialogTitle>
              <DialogDescription>Start a new community to bring people together.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
               <div className="flex flex-col items-center gap-2">
                  <div 
                     className="w-full h-32 bg-muted rounded-lg flex items-center justify-center cursor-pointer border-2 border-dashed relative overflow-hidden hover:bg-muted/70 transition-colors"
                     onClick={() => coverInputRef.current?.click()}
                  >
                     {newCommCoverPreview ? <img src={newCommCoverPreview} className="w-full h-full object-cover" /> : <div className="text-center text-muted-foreground"><Upload className="w-6 h-6 mx-auto mb-1"/>Upload Cover</div>}
                  </div>
                  <input type="file" ref={coverInputRef} className="hidden" onChange={e => {
                     const file = e.target.files?.[0];
                     if(file) { setNewCommCoverFile(file); setNewCommCoverPreview(URL.createObjectURL(file)); }
                  }} />
               </div>
               <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newCommName} onChange={e => setNewCommName(e.target.value)} placeholder="Community Name" />
               </div>
               <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={newCommDesc} onChange={e => setNewCommDesc(e.target.value)} placeholder="What's this community about?" />
               </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateCommunityOpen(false)}>Cancel</Button>
                <Button onClick={() => createCommunity.mutate()} disabled={createCommunity.isPending || !newCommName.trim()}>
                    {createCommunity.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
                </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

    </div>
  );
}
