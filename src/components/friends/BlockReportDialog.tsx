import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface BlockReportDialogProps {
  open: boolean;
  onClose: () => void;
  type: 'block' | 'report';
  userName?: string;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Fake account or impersonation' },
  { value: 'other', label: 'Other' },
];

const BLOCK_REASONS = [
  { value: 'unwanted', label: 'Unwanted contact' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other reason' },
];

export function BlockReportDialog({
  open,
  onClose,
  type,
  userName,
  onConfirm,
  isPending
}: BlockReportDialogProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const reasons = type === 'report' ? REPORT_REASONS : BLOCK_REASONS;
  const title = type === 'report' ? 'Report User' : 'Block User';
  const description = type === 'report' 
    ? `Report ${userName || 'this user'} for violating community guidelines`
    : `Block ${userName || 'this user'}? They won't be able to see your profile or contact you.`;

  const handleConfirm = () => {
    const finalReason = reason === 'other' ? customReason : reason;
    if (finalReason) {
      onConfirm(finalReason);
      setReason('');
      setCustomReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    setCustomReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={reason} onValueChange={setReason}>
            {reasons.map((r) => (
              <div key={r.value} className="flex items-center space-x-2">
                <RadioGroupItem value={r.value} id={r.value} />
                <Label htmlFor={r.value} className="cursor-pointer">{r.label}</Label>
              </div>
            ))}
          </RadioGroup>

          {reason === 'other' && (
            <Textarea
              placeholder="Please describe the reason..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button 
            variant={type === 'report' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!reason || (reason === 'other' && !customReason) || isPending}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {type === 'report' ? 'Submit Report' : 'Block User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
