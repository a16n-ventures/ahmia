import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, 
  MoreHorizontal, 
  Crown,
  XCircle,
  RefreshCw,
  Loader2,
  TrendingUp,
  Users,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Subscription = {
  user_id: string;
  status: string;
  plan_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  flutterwave_sub_id: string | null;
  profile?: {
    display_name: string | null;
    email: string | null;
  };
};

export default function AdminSubscriptions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // 1. Fetch Subscriptions
  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ['admin_subscriptions', search, page],
    queryFn: async () => {
      // Fetch subscriptions first
      const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('current_period_start', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!subs || subs.length === 0) return [];

      // Fetch profiles separately
      const userIds = subs.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', userIds);

      const profileMap = new Map();
      profiles?.forEach(p => profileMap.set(p.user_id, p));

      // Combine and filter
      let result = subs.map(s => ({
        ...s,
        profile: profileMap.get(s.user_id) || { display_name: null, email: null }
      }));

      if (search) {
        const lowerSearch = search.toLowerCase();
        result = result.filter((s: any) => 
          s.profile?.display_name?.toLowerCase().includes(lowerSearch) ||
          s.profile?.email?.toLowerCase().includes(lowerSearch)
        );
      }
      
      return result as Subscription[];
    },
    placeholderData: keepPreviousData
  });

  // 2. Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ['subscription_stats'],
    queryFn: async () => {
      const { count: activeCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: totalCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true });

      const { data: monthlyRevenue } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'successful');

      const revenue = monthlyRevenue?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      return {
        active: activeCount || 0,
        total: totalCount || 0,
        revenue
      };
    }
  });

  // 3. Mutation: Cancel Subscription
  const cancelMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId);
      if (error) throw error;

      // Also update profile premium status
      await supabase
        .from('profiles')
        .update({ is_premium: false, premium_tier: null })
        .eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Subscription cancelled");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription_stats'] });
    },
    onError: () => toast.error("Failed to cancel subscription")
  });

  // 4. Mutation: Reactivate Subscription
  const reactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('user_id', userId);
      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Subscription reactivated");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription_stats'] });
    },
    onError: () => toast.error("Failed to reactivate subscription")
  });

  // 5. Mutation: Grant Premium (Free)
  const grantPremiumMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Create or update subscription
      await supabase
        .from('subscriptions')
        .upsert({ 
          user_id: userId, 
          status: 'active',
          plan_interval: 'lifetime',
          current_period_start: new Date().toISOString()
        });

      await supabase
        .from('profiles')
        .update({ is_premium: true, premium_tier: 'admin_granted' })
        .eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Premium granted successfully");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
    },
    onError: () => toast.error("Failed to grant premium")
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Active</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelled</Badge>;
      case 'expired': return <Badge variant="secondary">Expired</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Subscription Management</h2>
        <p className="text-muted-foreground">Manage premium subscriptions and billing.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500" /> Active Subscribers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{(stats?.revenue || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input 
          placeholder="Search by name or email..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0"
        />
      </div>

      {/* Data Table */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No subscriptions found.
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => (
                <TableRow key={sub.user_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{(sub.profile as any)?.display_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{(sub.profile as any)?.email || sub.user_id.slice(0,8) + '...'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {sub.plan_interval || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(sub.status)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {sub.current_period_start && (
                      <div className="flex flex-col">
                        <span>{format(new Date(sub.current_period_start), 'MMM d, yyyy')}</span>
                        {sub.current_period_end && (
                          <span className="text-xs text-muted-foreground">
                            to {format(new Date(sub.current_period_end), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {sub.status === 'active' ? (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => cancelMutation.mutate(sub.user_id)}
                          >
                            <XCircle className="mr-2 h-4 w-4" /> Cancel Subscription
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem 
                            className="text-green-600"
                            onClick={() => reactivateMutation.mutate(sub.user_id)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" /> Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => grantPremiumMutation.mutate(sub.user_id)}>
                          <Crown className="mr-2 h-4 w-4 text-yellow-500" /> Grant Lifetime
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0 || isLoading}
        >
          Previous
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setPage(p => p + 1)}
          disabled={subscriptions.length < pageSize || isLoading}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
