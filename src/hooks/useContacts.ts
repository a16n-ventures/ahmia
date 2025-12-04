import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  invited_at?: string | null;
  is_app_user?: boolean | null;
  matched_user_id?: string | null;
};

const STALE_TIME = 30000;
const INVITE_COOLDOWN = 24 * 60 * 60 * 1000;

export const wasInvitedRecently = (invitedAt: string | null | undefined): boolean => {
  if (!invitedAt) return false;
  return (new Date().getTime() - new Date(invitedAt).getTime()) < INVITE_COOLDOWN;
};

const sanitizePhone = (phone: string): string => phone.replace(/\D/g, '');

export function useContacts(userId: string | undefined) {
  const queryClient = useQueryClient();

  const contactsQuery = useQuery({
    queryKey: ['contacts', userId],
    queryFn: async (): Promise<Contact[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  const addContact = useMutation({
    mutationFn: async ({ name, email, phone }: { name: string; email?: string; phone?: string }) => {
      if (!userId) throw new Error("Not authenticated");
      if (!name.trim()) throw new Error("Name is required");

      const trimmedName = name.trim();
      const trimmedEmail = email?.trim().toLowerCase() || null;

      // Check if user exists on platform
      if (trimmedEmail) {
        const { data: existingUsers } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, email')
          .neq('user_id', userId)
          .eq('email', trimmedEmail);

        if (existingUsers && existingUsers.length > 0) {
          const foundUser = existingUsers[0];
          
          const { data: relationship } = await supabase
            .from('friendships')
            .select('status')
            .or(`and(requester_id.eq.${userId},addressee_id.eq.${foundUser.user_id}),and(requester_id.eq.${foundUser.user_id},addressee_id.eq.${userId})`)
            .maybeSingle();

          if (relationship?.status === 'accepted') return { status: 'already_friends', user: foundUser };
          if (relationship?.status === 'pending') return { status: 'pending_exists', user: foundUser };

          await supabase.from('friendships').insert({ 
            requester_id: userId, 
            addressee_id: foundUser.user_id, 
            status: 'pending' 
          });
          return { status: 'request_sent', user: foundUser };
        }
      }

      // Save as contact (not on platform)
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: trimmedName,
          email: trimmedEmail,
          phone: phone?.trim() || null,
          is_app_user: false
        })
        .select()
        .single();

      if (error) throw error;
      return { status: 'contact_saved', data };
    },
    onSuccess: async (result) => {
      if (result.status === 'request_sent') {
        toast.success(`User found! Friend request sent to ${result.user?.display_name}.`);
        queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      } else if (result.status === 'already_friends') {
        toast.info(`Already friends with ${result.user?.display_name}!`);
      } else if (result.status === 'pending_exists') {
        toast.info(`Request already pending for ${result.user?.display_name}.`);
      } else {
        toast.success('Contact saved. Invite them to join!');
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      }
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to add contact')
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete()
        .eq('id', contactId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info('Contact removed');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to remove contact')
  });

  const inviteContact = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!userId) throw new Error("Not authenticated");

      // Update invited timestamp
      await supabase
        .from('contacts')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', contact.id);

      const appName = "Lynq";
      const inviteLink = "https://lynq.app/join";
      const message = `Hey ${contact.name.split(' ')[0]}, join me on ${appName}! Download here: ${inviteLink}`;
      
      if (contact.phone) {
        const cleanPhone = sanitizePhone(contact.phone);
        const separator = /iphone|ipad|ipod/i.test(navigator.userAgent) ? '&' : '?';
        window.location.href = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
      } else if (contact.email) {
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Join me on " + appName)}&body=${encodeURIComponent(message)}`;
      }
      
      return contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to invite contact')
  });

  return {
    contacts: contactsQuery.data || [],
    isLoading: contactsQuery.isPending,
    error: contactsQuery.error,
    addContact,
    deleteContact,
    inviteContact,
  };
}
