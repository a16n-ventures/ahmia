import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Share2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Camera,
  StopCircle,
  Play,
  Download,
  Loader2,
  UserPlus,
  ExternalLink,
  Clock,
  Check,
  Trash2, 
  AlertCircle,
  Megaphone,
  Search,
  Copy,
  Pencil
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useFriends } from "@/hooks/useFriends";

// Badge Component Helper
const PremiumBadge = () => (
  <svg 
    className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1 inline-block align-middle" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified Premium"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editMaxAttendees, setEditMaxAttendees] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const { friends } = useFriends(user?.id);

  // Invite friends logic - Refactored for proper selection
  const handleInviteFriends = async () => {
    if (selectedFriends.length === 0) return;
    
    try {
      const invitations = selectedFriends.map(friendId => ({
        event_id: id,
        inviter_id: user?.id,
        invitee_id: friendId,
        status: 'pending'
      }));

      const { error } = await supabase
        .from('event_invitations')
        .insert(invitations);

      if (error) throw error;

      toast.success(`Sent invitations to ${selectedFriends.length} friends`);
      setShowInviteModal(false);
      setSelectedFriends([]);
    } catch (error: any) {
      toast.error("Failed to send invitations");
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  // Select/Deselect All
  const handleSelectAll = () => {
    if (selectedFriends.length === filteredFriends.length) {
      setSelectedFriends([]);
    } else {
      setSelectedFriends(filteredFriends.map(f => f.id));
    }
  };

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          creator:profiles!creator_id(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // ✅ Check Creator Premium Status
      if (data?.creator) {
        const { data: premiumFeature } = await supabase
          .from('premium_features')
          .select('is_active')
          .eq('user_id', data.creator.user_id)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', data.creator.user_id)
          .maybeSingle();

        // Attach premium status to creator object
        data.creator.is_premium = !!premiumFeature || sub?.status === 'active';
      }

      return data;
    },
  });

  const { data: attendees = [] } = useQuery({
    queryKey: ['event_attendees', id],
    queryFn: async () => {
      // First get attendees
      const { data, error } = await supabase
        .from('event_attendees')
        .select(`
          user_id,
          status,
          profile:profiles!user_id(*)
        `)
        .eq('event_id', id);

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // ✅ Check Premium Status for all attendees
      const userIds = data.map(a => a.user_id);
      
      const { data: premiumFeatures } = await supabase
        .from('premium_features')
        .select('user_id')
        .in('user_id', userIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id')
        .in('user_id', userIds)
        .eq('status', 'active');

      const premiumUserSet = new Set([
        ...(premiumFeatures?.map(p => p.user_id) || []),
        ...(subs?.map(s => s.user_id) || [])
      ]);

      return data.map(attendee => ({
        ...attendee,
        profile: {
          ...attendee.profile,
          is_premium: premiumUserSet.has(attendee.user_id)
        }
      }));
    }
  });

  const isCreator = user?.id === event?.creator_id;

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Event deleted successfully');
      navigate('/app/events');
    },
    onError: (error) => {
      toast.error('Failed to delete event: ' + error.message);
    }
  });

  const editEventMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('events')
        .update({
          title: editTitle,
          description: editDescription,
          location: editLocation,
          start_date: editStartDate,
          price: editPrice ? parseFloat(editPrice) : 0,
          max_attendees: editMaxAttendees ? parseInt(editMaxAttendees) : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Event updated successfully');
      setShowEditDialog(false);
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    },
    onError: (error) => {
      toast.error('Failed to update event: ' + error.message);
    }
  });

  useEffect(() => {
    if (event) {
      setEditTitle(event.title);
      setEditDescription(event.description || '');
      setEditLocation(event.location);
      setEditStartDate(new Date(event.start_date).toISOString().slice(0, 16));
      setEditPrice(event.price?.toString() || '');
      setEditMaxAttendees(event.max_attendees?.toString() || '');
    }
  }, [event]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Event not found</p>
        <Button onClick={() => navigate('/app/events')}>Back to Events</Button>
      </div>
    );
  }

  const filteredFriends = (friends || []).filter((f: any) => {
    // Determine the correct friend ID and profile data depending on who initiated the request
    const friendId = f.requester_id === user?.id ? f.addressee_id : f.requester_id;
    const friendProfile = f.requester_id === user?.id ? f.addressee : f.requester;
    
    // Check if this friend is already an attendee
    const isAlreadyAttendee = attendees.some((a: any) => a.user_id === friendId);
    
    // Filter by search and exclude existing attendees
    return !isAlreadyAttendee && 
           friendProfile?.display_name?.toLowerCase().includes(inviteSearch.toLowerCase());
  }).map((f: any) => {
    // Normalize friend object for easier rendering
    return f.requester_id === user?.id ? 
      { id: f.addressee_id, ...f.addressee } : 
      { id: f.requester_id, ...f.requester };
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <img 
          src={event.image_url || '/placeholder-event.jpg'} 
          alt={event.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 left-4 bg-background/50 backdrop-blur-sm hover:bg-background/80"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        
        {/* Creator Controls */}
        {isCreator && (
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="bg-background/50 backdrop-blur-sm hover:bg-background/80 text-blue-600"
              onClick={() => setShowEditDialog(true)}
            >
              <Pencil className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="bg-background/50 backdrop-blur-sm hover:bg-red-100 text-red-600"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>

      <div className="container-mobile -mt-12 relative px-4">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                  {event.is_sponsored ? 'Sponsored' : 'Event'}
                </Badge>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
              
              {/* Creator Info with Premium Badge */}
              <div className="flex items-center gap-2 mb-4">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={event.creator?.avatar_url} />
                  <AvatarFallback>{event.creator?.display_name?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  Hosted by <span className="font-medium text-foreground">
                    {event.creator?.display_name}
                    {event.creator?.is_premium && <PremiumBadge />}
                  </span>
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{new Date(event.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    <p className="text-muted-foreground">{new Date(event.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{event.location}</p>
                    <p className="text-muted-foreground">View on Map</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{event.price > 0 ? `₦${event.price.toLocaleString()}` : 'Free Entry'}</p>
                    <p className="text-muted-foreground">Per person</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h3 className="font-semibold mb-3">About Event</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.description}
              </p>
            </div>

            {/* Attendees Section with Premium Badges */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Attendees ({attendees.length})</h3>
                {isCreator && (
                  <Button variant="outline" size="sm" onClick={() => setShowInviteModal(true)}>
                    <UserPlus className="w-4 h-4 mr-2" /> Invite
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {attendees.map((attendee: any) => (
                  <div key={attendee.user_id} className="relative group">
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={attendee.profile?.avatar_url} />
                      <AvatarFallback>{attendee.profile?.display_name?.[0]}</AvatarFallback>
                    </Avatar>
                    {/* Tiny premium indicator on avatar */}
                    {attendee.profile?.is_premium && (
                      <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                        <svg className="w-3 h-3 text-blue-500" viewBox="0 0 22 22" fill="currentColor">
                          <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
                {attendees.length === 0 && (
                  <p className="text-sm text-muted-foreground">No attendees yet. Be the first!</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t">
        <div className="container-mobile flex gap-3">
          <Button variant="outline" className="flex-1">Maybe</Button>
          <Button className="flex-[2] gradient-primary text-white font-semibold shadow-lg">Join Event</Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteEventMutation.mutate()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Friends Modal - Refactored */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Friends</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search friends..."
                className="pl-9"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
              />
            </div>
            
            <div className="flex justify-end">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedFriends.length === filteredFriends.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {filteredFriends.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">No friends found</p>
              ) : (
                filteredFriends.map((friend: any) => (
                  <div 
                    key={friend.id}
                    className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
                    onClick={() => toggleFriendSelection(friend.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={friend.avatar_url} />
                        <AvatarFallback>{friend.display_name?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{friend.display_name}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      selectedFriends.includes(friend.id) 
                        ? 'bg-primary border-primary text-white' 
                        : 'border-muted-foreground'
                    }`}>
                      {selectedFriends.includes(friend.id) && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleInviteFriends}
              disabled={selectedFriends.length === 0}
            >
              Send {selectedFriends.length} Invitation{selectedFriends.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Event Title"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe your event..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Event Location"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date & Time</label>
              <Input
                type="datetime-local"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Price (NGN)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                <Input
                  type="number"
                  className="pl-8"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="0 for free"
                  min="0"
                />
              </div>
            </div>

            {/* Max Attendees */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Attendees (Optional)</label>
              <Input
                type="number"
                value={editMaxAttendees}
                onChange={(e) => setEditMaxAttendees(e.target.value)}
                placeholder="Unlimited"
                min="1"
              />
            </div>
          </div>
      
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowEditDialog(false)}
              disabled={editEventMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editEventMutation.mutate()}
              disabled={
                editEventMutation.isPending || 
                !editTitle.trim() || 
                !editDescription.trim() || 
                !editLocation.trim() ||
                !editStartDate
              }
            >
              {editEventMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventDetail;
