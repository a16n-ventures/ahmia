// File: /components/messages/CommunitySettingsDialog.tsx

import React, { useState, useRef, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Upload, X, Trash2 } from "lucide-react";

interface CommunitySettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentName: string;
  currentDesc: string;
  currentCoverUrl?: string;
}

const validateImage = (file: File): string | null => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    return 'Please upload a valid image (JPEG, PNG, WebP, or GIF)';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'Image size must be less than 5MB';
  }
  return null;
};

export function CommunitySettingsDialog({
  isOpen,
  onClose,
  communityId,
  currentName,
  currentDesc,
  currentCoverUrl,
}: CommunitySettingsDialogProps) {
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDesc);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setDescription(currentDesc);
      setCoverFile(null);
      setCoverPreview(null);
    }
  }, [isOpen, currentName, currentDesc]);

  const handleCoverSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const error = validateImage(file);
    if (error) {
      toast.error(error);
      return;
    }
    
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }, []);

  const updateCommunityMutation = useMutation({
    mutationFn: async () => {
      let coverUrl: string | null | undefined = currentCoverUrl;
      
      // Upload new cover if changed
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const filePath = `community-covers/${communityId}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, coverFile, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (uploadError) {
          throw new Error("Failed to upload cover image");
        }
        
        const { data: urlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);
        
        coverUrl = urlData.publicUrl;
      }
      
      // Update community
      const { error } = await supabase
        .from('communities')
        .update({
          name: name.trim(),
          description: description.trim(),
          cover_url: coverUrl,
        })
        .eq('id', communityId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Community updated successfully!");
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update community");
    },
  });

  const deleteCommunityMutation = useMutation({
    mutationFn: async () => {
      // Delete community members first
      const { error: membersError } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId);
      
      if (membersError) throw membersError;

      // Delete community messages
      const { error: messagesError } = await supabase
        .from('community_messages')
        .delete()
        .eq('community_id', communityId);
      
      if (messagesError) throw messagesError;

      // Delete community
      const { error } = await supabase
        .from('communities')
        .delete()
        .eq('id', communityId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Community deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      setShowDeleteDialog(false);
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete community");
    },
  });

  const hasChanges = 
    name.trim() !== currentName ||
    description.trim() !== currentDesc ||
    coverFile !== null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px] max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Community Settings</DialogTitle>
            <DialogDescription>
              Update your community information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Cover Image */}
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp,image/gif" 
                className="hidden" 
                ref={coverInputRef} 
                onChange={handleCoverSelect} 
              />
              
              {(coverPreview || currentCoverUrl) ? (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-dashed border-primary/30 group">
                  <img 
                    src={coverPreview || currentCoverUrl} 
                    className="w-full h-full object-cover" 
                    alt="Cover" 
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setCoverFile(null);
                        if (coverPreview?.startsWith('blob:')) {
                          try { URL.revokeObjectURL(coverPreview); } catch {}
                        }
                        setCoverPreview(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Upload cover image</span>
                </button>
              )}
            </div>

            {/* Community Name */}
            <div className="space-y-2">
              <Label>Community Name *</Label>
              <Input 
                placeholder="Enter community name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                maxLength={50}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                placeholder="What's this community about?" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                rows={4} 
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/200
              </p>
            </div>

            {/* Danger Zone */}
            <div className="pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-destructive">Danger Zone</Label>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Community
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={() => updateCommunityMutation.mutate()}
              disabled={!hasChanges || !name.trim() || updateCommunityMutation.isPending}
            >
              {updateCommunityMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Community?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{currentName}</strong> and all its messages. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCommunityMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteCommunityMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete Community"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
