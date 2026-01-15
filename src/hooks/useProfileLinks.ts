import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface ProfileLink {
  id: string;
  user_id: string;
  title: string;
  url: string;
  icon?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * NUCLEAR FIX: Hook now uses auth context directly for mutations
 * to ensure user_id matches auth.uid() exactly
 */
export function useProfileLinks(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth(); // Get authenticated user directly
  
  // Use auth user ID for mutations, but allow viewing any user's links
  const authUserId = user?.id;
  const isOwnProfile = authUserId === userId;

  const linksQuery = useQuery({
    queryKey: ['profile-links', userId],
    queryFn: async (): Promise<ProfileLink[]> => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('profile_links')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching profile links:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!userId,
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ title, url, icon }: { title: string; url: string; icon?: string }) => {
      // NUCLEAR FIX: Always use auth user's ID, not the passed userId
      if (!authUserId) {
        throw new Error('You must be logged in to add links');
      }
      
      if (!isOwnProfile) {
        throw new Error('You can only add links to your own profile');
      }
      
      // Validate inputs
      if (!title.trim()) throw new Error('Title is required');
      if (!url.trim()) throw new Error('URL is required');
      
      // Get max sort order for the authenticated user
      const { data: existing } = await supabase
        .from('profile_links')
        .select('sort_order')
        .eq('user_id', authUserId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = (existing?.sort_order || 0) + 1;

      // Format URL
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      console.log('Adding link with authUserId:', authUserId, 'title:', title, 'url:', formattedUrl);

      const { data, error } = await supabase
        .from('profile_links')
        .insert({
          user_id: authUserId, // CRITICAL: Use auth user ID directly
          title: title.trim(),
          url: formattedUrl,
          icon: icon || null,
          sort_order: sortOrder
        })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        throw new Error(error.message || 'Failed to add link');
      }
      
      return data;
    },
    onSuccess: () => {
      toast.success('Link added successfully! ✨');
      queryClient.invalidateQueries({ queryKey: ['profile-links', authUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      console.error('Add link mutation error:', error);
      toast.error(error.message || 'Failed to add link');
    }
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, title, url }: { id: string; title: string; url: string }) => {
      if (!authUserId) throw new Error('You must be logged in');
      
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const { error } = await supabase
        .from('profile_links')
        .update({
          title: title.trim(),
          url: formattedUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', authUserId); // CRITICAL: Use auth user ID

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Link updated');
      queryClient.invalidateQueries({ queryKey: ['profile-links', authUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update link');
    }
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      if (!authUserId) throw new Error('You must be logged in');

      const { error } = await supabase
        .from('profile_links')
        .delete()
        .eq('id', linkId)
        .eq('user_id', authUserId); // CRITICAL: Use auth user ID

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['profile-links', authUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove link');
    }
  });

  const reorderLinksMutation = useMutation({
    mutationFn: async (links: { id: string; sort_order: number }[]) => {
      if (!authUserId) throw new Error('You must be logged in');

      const updates = links.map(({ id, sort_order }) =>
        supabase
          .from('profile_links')
          .update({ sort_order })
          .eq('id', id)
          .eq('user_id', authUserId)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-links', authUserId] });
    }
  });

  return {
    links: linksQuery.data || [],
    isLoading: linksQuery.isPending,
    error: linksQuery.error,
    addLink: addLinkMutation.mutate,
    addLinkAsync: addLinkMutation.mutateAsync,
    updateLink: updateLinkMutation.mutate,
    deleteLink: deleteLinkMutation.mutate,
    reorderLinks: reorderLinksMutation.mutate,
    isAdding: addLinkMutation.isPending,
    isUpdating: updateLinkMutation.isPending,
    isDeleting: deleteLinkMutation.isPending,
    canEdit: isOwnProfile && !!authUserId,
    refetch: linksQuery.refetch,
  };
}
