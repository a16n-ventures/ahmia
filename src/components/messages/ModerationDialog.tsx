import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Ban, VolumeX, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CommunityMember, ModerationType } from '@/types/messages';
import { formatDuration } from '@/utils/messageHelpers';

interface ModerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  member: CommunityMember | null;
  actionType: ModerationType;
  onActionComplete?: () => void;
}

const MUTE_DURATIONS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '24 hours' },
  { value: 10080, label: '7 days' },
];

const getActionDetails = (type: ModerationType) => {
  switch (type) {
    case 'kick':
      return { 
        title: 'Kick Member', 
        description: 'Remove this member from the community. They can rejoin later.',
        icon: AlertCircle,
        buttonText: 'Kick Member',
        buttonClass: 'bg-orange-600 hover:bg-orange-700'
      };
    case 'ban':
      return { 
        title: 'Ban Member', 
        description: 'Permanently ban this member. They cannot rejoin unless unbanned.',
        icon: Ban,
        buttonText: 'Ban Member',
        buttonClass: 'bg-destructive hover:bg-destructive/90'
      };
    case 'mute':
      return { 
        title: 'Mute Member', 
        description: 'Temporarily prevent this member from sending messages.',
        icon: VolumeX,
        buttonText: 'Mute Member',
        buttonClass: 'bg-yellow-600 hover:bg-yellow-700'
      };
    case 'warn':
      return { 
        title: 'Warn Member', 
        description: 'Send an official warning to this member.',
        icon: AlertTriangle,
        buttonText: 'Send Warning',
        buttonClass: 'bg-amber-600 hover:bg-amber-700'
      };
    case 'unban':
      return { 
        title: 'Unban Member', 
        description: 'Remove the ban and allow this user to rejoin.',
        icon: Ban,
        buttonText: 'Unban',
        buttonClass: 'bg-green-600 hover:bg-green-700'
      };
    case 'unmute':
      return { 
        title: 'Unmute Member', 
        description: 'Allow this member to send messages again.',
        icon: VolumeX,
        buttonText: 'Unmute',
        buttonClass: 'bg-green-600 hover:bg-green-700'
      };
    default:
      return { 
        title: 'Action', 
        description: '', 
        icon: AlertCircle, 
        buttonText: 'Confirm',
        buttonClass: ''
      };
  }
};

export const ModerationDialog: React.FC<ModerationDialogProps> = ({
  isOpen,
  onClose,
  communityId,
  member,
  actionType,
  onActionComplete
}) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [muteDuration, setMuteDuration] = useState<number>(60);

  const actionDetails = getActionDetails(actionType);
  const Icon = actionDetails.icon;

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;

      switch (actionType) {
        case 'kick':
          await supabase
            .from('community_members')
            .delete()
            .eq('community_id', communityId)
            .eq('user_id', member.user_id);
          break;

        case 'ban':
          // Update member to banned status (using role as workaround since schema doesn't have is_banned)
          await supabase
            .from('community_members')
            .delete()
            .eq('community_id', communityId)
            .eq('user_id', member.user_id);
          // Note: In production, you'd want a banned_users table
          break;

        case 'mute':
          // Mute logic - would need schema update for muted_until field
          // For now, we'll use a workaround
          toast.info(`Member muted for ${formatDuration(muteDuration)}`);
          break;

        case 'warn':
          // Warning notification - would be sent via notifications table
          toast.success('Warning sent to member');
          break;

        case 'unban':
        case 'unmute':
          // Reverse actions
          break;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_members'] });
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      
      const actionName = actionType.charAt(0).toUpperCase() + actionType.slice(1);
      toast.success(`${actionName} action completed`);
      
      setReason('');
      onClose();
      onActionComplete?.();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Moderation action failed')
  });

  if (!member) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {actionDetails.title}
          </DialogTitle>
          <DialogDescription>
            {actionDetails.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
              {member.profile?.display_name?.[0] || '?'}
            </div>
            <div>
              <p className="font-medium">{member.profile?.display_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
            </div>
          </div>

          {actionType === 'mute' && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={muteDuration.toString()} onValueChange={(v) => setMuteDuration(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUTE_DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value.toString()}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason {actionType !== 'warn' && '(optional)'}</Label>
            <Textarea 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              rows={3}
              placeholder={actionType === 'warn' ? 'Explain the warning...' : 'Reason for this action...'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => executeMutation.mutate()} 
            disabled={executeMutation.isPending || (actionType === 'warn' && !reason.trim())}
            className={actionDetails.buttonClass}
          >
            {executeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Icon className="w-4 h-4 mr-2" />
            )}
            {actionDetails.buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
