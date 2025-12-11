import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Check, Loader2 } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CommunitySettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentName: string;
  currentDesc: string;
}

export const CommunitySettingsDialog: React.FC<CommunitySettingsDialogProps> = ({
  isOpen,
  onClose,
  communityId,
  currentName,
  currentDesc,
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [desc, setDesc] = useState(currentDesc);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    setName(currentName);
    setDesc(currentDesc);
  }, [currentName, currentDesc, isOpen]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Community name is required');
      await supabase
        .from('communities')
        .update({ name: name.trim(), description: desc.trim() })
        .eq('id', communityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community updated");
      onClose();
    },
    onError: (error: any) => toast.error(error?.message || "Failed to update community")
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('communities').delete().eq('id', communityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community deleted");
      setShowDeleteDialog(false);
      onClose();
    },
    onError: () => toast.error("Failed to delete community")
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Community Settings</DialogTitle>
            <DialogDescription>Manage your community's information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/20 rounded-lg text-sm text-muted-foreground border border-dashed">
              Cover photo management is currently disabled.
            </div>
            <div className="space-y-2">
              <Label>Community Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={200} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="destructive" className="w-full sm:w-auto" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !name.trim()} className="flex-1 sm:flex-none">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Community?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
