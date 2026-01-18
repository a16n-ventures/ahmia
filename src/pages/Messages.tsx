import React, { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Search, Send, ArrowLeft, MessageSquare, Users, Calendar, 
  MapPin, Ticket, Info, Plus, Image as ImageIcon, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// --- TYPES ---
type ChatType = 'dm' | 'community' | 'event';

interface ChatItem {
  id: string;
  type: ChatType;
  name: string;
  avatar?: string;
  subtitle?: string; // Last message or member count
  meta?: any; // Extra data (event date, location)
  partner_id?: string; // For DMs
}

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<ChatType>('dm');
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- 1. INITIALIZATION & DEEP LINKING ---
  // Opens the correct chat if you click "Message" from a profile or "Join Chat" from an event
  useEffect(() => {
    const type = searchParams.get('type') as ChatType;
    const id = searchParams.get('id');
    
    if (type && id && user) {
      setActiveTab(type);
      // Fetch details immediately to open chat
      const fetchAndOpen = async () => {
        let chat: ChatItem | null = null;
        if (type === 'event') {
          const { data } = await supabase.from('events').select('*').eq('id', id).single();
          if (data) chat = { id: data.id, type: 'event', name: data.title, avatar: data.image_url, meta: { date: data.start_date, location: data.location } };
        } else if (type === 'community') {
          const { data } = await supabase.from('communities').select('*').eq('id', id).single();
          if (data) chat = { id: data.id, type: 'community', name: data.name, avatar: data.cover_url || data.avatar_url };
        } else {
          const { data } = await supabase.from('profiles').select('*').eq('user_id', id).single();
          if (data) chat = { id: id, type: 'dm', name: data.display_name, avatar: data.avatar_url, partner_id: id };
        }
        if (chat) setSelectedChat(chat);
      };
      fetchAndOpen();
    }
  }, [searchParams, user]);

  // --- 2. DATA FETCHING (The 3 Pillars) ---

  // A. DIRECT MESSAGES
  const { data: dmList = [] } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch latest messages to build conversation list
      const { data } = await supabase.from('messages')
        .select(`*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)`)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (!data) return [];

      const seen = new Set();
      const conversations: ChatItem[] = [];

      data.forEach((msg: any) => {
        const partner = msg.sender_id === user.id ? msg.receiver : msg.sender;
        if (!partner || seen.has(partner.user_id)) return;
        
        seen.add(partner.user_id);
        conversations.push({
          id: partner.user_id,
          type: 'dm',
          name: partner.display_name || 'User',
          avatar: partner.avatar_url,
          subtitle: msg.content || 'Image',
          partner_id: partner.user_id
        });
      });
      return conversations;
    },
    enabled: !!user && activeTab === 'dm'
  });

  // B. GROUPS (Communities)
  const { data: commList = [] } = useQuery({
    queryKey: ['comm_list_chat', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('community_members').select('community:communities(*)').eq('user_id', user.id);
      return (data || []).map((item: any) => ({
        id: item.community.id,
        type: 'community',
        name: item.community.name,
        avatar: item.community.cover_url || item.community.avatar_url,
        subtitle: `${item.community.member_count || 0} members`
      })) as ChatItem[];
    },
    enabled: !!user && activeTab === 'community'
  });

  // C. VIBE CHECKS (Events) - The "Decide" Engine 🚀
  const { data: eventList = [] } = useQuery({
    queryKey: ['event_list_chat', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch events user has RSVP'd to (Confirmed status)
      const { data } = await supabase.from('event_attendees').select('event:events(*)').eq('user_id', user.id);
      return (data || []).map((item: any) => ({
        id: item.event.id,
        type: 'event',
        name: item.event.title,
        avatar: item.event.image_url,
        subtitle: item.event.location || 'Online',
        meta: { date: item.event.start_date, location: item.event.location }
      })) as ChatItem[];
    },
    enabled: !!user && activeTab === 'event'
  });

  // --- 3. ACTIVE CHAT MESSAGES ---
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['messages', selectedChat?.type, selectedChat?.id],
    queryFn: async () => {
      if (!user || !selectedChat) return [];
      
      let query;
      if (selectedChat.type === 'dm') {
        query = supabase.from('messages').select('*').or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`);
      } else if (selectedChat.type === 'community') {
        query = supabase.from('community_messages').select(`*, sender:profiles!sender_id(*)`).eq('community_id', selectedChat.id);
      } else {
        query = supabase.from('event_chats').select(`*, sender:profiles!user_id(*)`).eq('event_id', selectedChat.id);
      }

      const { data } = await query.order('created_at', { ascending: true });
      
      return (data || []).map((m: any) => ({
        id: m.id,
        content: m.content || m.message,
        sender_id: m.sender_id || m.user_id,
        sender_name: m.sender?.display_name || 'User',
        sender_avatar: m.sender?.avatar_url,
        created_at: m.created_at,
        is_me: (m.sender_id || m.user_id) === user.id
      }));
    },
    enabled: !!selectedChat,
    refetchInterval: 3000 // Simple polling for instant feel
  });

  // --- 4. SEND MESSAGE ---
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !selectedChat || !messageInput.trim()) return;
      const text = messageInput.trim();
      setMessageInput(''); 

      if (selectedChat.type === 'dm') {
        await supabase.from('messages').insert({ sender_id: user.id, receiver_id: selectedChat.partner_id, content: text });
      } else if (selectedChat.type === 'community') {
        await supabase.from('community_messages').insert({ community_id: selectedChat.id, sender_id: user.id, content: text });
      } else {
        await supabase.from('event_chats').insert({ event_id: selectedChat.id, user_id: user.id, message: text });
      }
      refetchMessages();
    }
  });

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // --- RENDER ---
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      
      {/* LEFT SIDEBAR (The Navigation) */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-muted/5 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-background/95 sticky top-0 z-10">
          <h1 className="text-xl font-bold mb-4">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search chats..." 
              className="pl-9 bg-muted/50 border-0 rounded-xl focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* THE 3 PILLARS (Clyx Style) */}
        <div className="px-2 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatType)} className="w-full">
            <TabsList className="w-full bg-muted/50 p-1 rounded-xl grid grid-cols-3">
              <TabsTrigger value="dm" className="rounded-lg text-xs">Direct</TabsTrigger>
              <TabsTrigger value="community" className="rounded-lg text-xs">Groups</TabsTrigger>
              <TabsTrigger value="event" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-medium">
                 Vibe Checks
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* CHAT LIST */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Empty States */}
          {activeTab === 'event' && eventList.length === 0 && (
             <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
               <Calendar className="w-10 h-10 mb-2 opacity-20" />
               <p className="text-sm">RSVP to events to join their Vibe Check chats!</p>
               <Button variant="link" onClick={() => navigate('/app/feed')}>Browse Events</Button>
             </div>
          )}

          {/* List Items */}
          {(activeTab === 'dm' ? dmList : activeTab === 'community' ? commList : eventList)
            .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
            >
              <div className="relative">
                <Avatar className="h-12 w-12 border bg-muted">
                   <AvatarImage src={chat.avatar} className="object-cover" />
                   <AvatarFallback>{chat.name[0]}</AvatarFallback>
                </Avatar>
                {chat.type === 'event' && (
                   <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                      <div className="bg-orange-500 rounded-full p-1 text-white shadow-sm">
                         <Calendar className="w-2.5 h-2.5" />
                      </div>
                   </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                 <div className="flex justify-between items-center mb-0.5">
                    <h4 className={`font-semibold text-sm truncate ${selectedChat?.id === chat.id ? 'text-primary' : ''}`}>{chat.name}</h4>
                    {chat.meta?.date && (
                       <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                         {new Date(chat.meta.date).getDate()} {new Date(chat.meta.date).toLocaleString('default', { month: 'short' })}
                       </span>
                    )}
                 </div>
                 <p className="text-xs text-muted-foreground truncate">{chat.subtitle || 'Tap to chat'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT SIDEBAR (The Conversation) */}
      <div className={`flex-1 flex flex-col bg-background h-full ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <>
            {/* DYNAMIC HEADER */}
            <div className="h-16 border-b flex items-center justify-between px-4 bg-background/80 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setSelectedChat(null)}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Avatar className="h-9 w-9 border">
                  <AvatarImage src={selectedChat.avatar} />
                  <AvatarFallback>{selectedChat.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-bold text-sm">{selectedChat.name}</h2>
                  {selectedChat.type === 'event' ? (
                     <p className="text-xs text-primary flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {selectedChat.meta?.location || 'Online'}
                     </p>
                  ) : (
                     <p className="text-xs text-muted-foreground">
                        {selectedChat.type === 'community' ? 'Community Chat' : 'Online'}
                     </p>
                  )}
                </div>
              </div>

              {/* ACTION BUTTON (The "Decide -> Do" Bridge) */}
              {selectedChat.type === 'event' && (
                 <Button size="sm" className="gap-2 rounded-full h-8 text-xs bg-primary/90 hover:bg-primary shadow-sm" onClick={() => navigate('/app/feed')}>
                    <Ticket className="w-3 h-3" /> View Event
                 </Button>
              )}
              {selectedChat.type === 'community' && (
                 <Button size="icon" variant="ghost"><Info className="w-5 h-5" /></Button>
              )}
            </div>

            {/* MESSAGES AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-muted/5 to-background" ref={scrollRef}>
               {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                     <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-3">
                        <MessageSquare className="w-8 h-8 opacity-50" />
                     </div>
                     <p className="text-sm font-medium">Start the vibe...</p>
                  </div>
               ) : (
                 messages.map((msg: any) => (
                   <div key={msg.id} className={`flex gap-3 ${msg.is_me ? 'flex-row-reverse' : ''}`}>
                      {!msg.is_me && (
                        <Avatar className="w-8 h-8 mt-1 border">
                          <AvatarImage src={msg.sender_avatar} />
                          <AvatarFallback>U</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${msg.is_me ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                         {!msg.is_me && selectedChat.type !== 'dm' && (
                           <p className="text-[10px] font-bold opacity-70 mb-1">{msg.sender_name}</p>
                         )}
                         <p>{msg.content}</p>
                         <p className="text-[9px] opacity-50 text-right mt-1">{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</p>
                      </div>
                   </div>
                 ))
               )}
            </div>

            {/* INPUT AREA */}
            <div className="p-4 border-t bg-background">
               <div className="flex items-end gap-2 bg-muted/50 p-2 rounded-3xl border focus-within:border-primary/50 transition-colors">
                  <Button size="icon" variant="ghost" className="rounded-full h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10">
                     <Plus className="w-5 h-5" />
                  </Button>
                  <Textarea 
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`Message ${selectedChat.type === 'event' ? 'everyone' : selectedChat.name.split(' ')[0]}...`}
                    className="flex-1 min-h-[40px] max-h-32 bg-transparent border-0 focus-visible:ring-0 resize-none py-2.5 text-sm"
                    onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage.mutate();
                       }
                    }}
                  />
                  <Button 
                    size="icon" 
                    className="rounded-full h-10 w-10 shrink-0 shadow-sm" 
                    disabled={!messageInput.trim()}
                    onClick={() => sendMessage.mutate()}
                  >
                     <Send className="w-4 h-4" />
                  </Button>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/5">
            <div className="w-24 h-24 bg-muted/30 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="w-12 h-12 opacity-20" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">Select a Conversation</h3>
            <p className="max-w-xs mx-auto text-sm leading-relaxed">
              Join a <strong>Vibe Check</strong> from an event, chat with a community, or DM a friend to start planning.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
