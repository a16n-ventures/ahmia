import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, AlertTriangle, DollarSign, TrendingUp, UserPlus, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
  
  // 1. Fetch Stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin_stats'],
    queryFn: async () => {
      // A. Total Users
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // B. Total Events
      const { count: eventCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });
      
      // C. Pending Reports
      const { count: reportCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // D. Total Revenue from confirmed payments
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'successful');
      
      const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      // E. Premium users count
      const { count: premiumCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_premium', true);

      // F. New users (last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { count: newUserCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo);

      return {
        users: userCount || 0,
        events: eventCount || 0,
        reports: reportCount || 0,
        revenue: totalRevenue,
        premiumUsers: premiumCount || 0,
        newUsers: newUserCount || 0
      };
    }
  });

  // 2. Fetch User Growth Data (last 30 days)
  const { data: growthData = [] } = useQuery({
    queryKey: ['admin_growth'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30);
      const { data } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Group by day
      const dailyCounts: Record<string, number> = {};
      data?.forEach(profile => {
        const day = format(new Date(profile.created_at), 'MMM dd');
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      });

      // Fill in missing days
      const result = [];
      for (let i = 29; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayKey = format(date, 'MMM dd');
        result.push({
          date: dayKey,
          users: dailyCounts[dayKey] || 0
        });
      }
      return result;
    }
  });

  // 3. Fetch Recent Activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['admin_activity'],
    queryFn: async () => {
      const [usersRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('display_name, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('events').select('title, created_at').order('created_at', { ascending: false }).limit(3)
      ]);

      const activities: any[] = [];
      usersRes.data?.forEach(u => activities.push({ type: 'user', name: u.display_name, time: u.created_at }));
      eventsRes.data?.forEach(e => activities.push({ type: 'event', name: e.title, time: e.created_at }));
      
      return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);
    }
  });

  const StatCard = ({ title, value, icon: Icon, color, subValue }: any) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-full ${color} bg-opacity-10`}>
          <Icon className={`h-4 w-4 ${color.replace('bg-', 'text-')}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}</div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of Lynq platform performance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Users" 
          value={stats?.users.toLocaleString()} 
          icon={Users} 
          color="bg-blue-500"
          subValue={`+${stats?.newUsers || 0} this week`}
        />
        <StatCard 
          title="Active Events" 
          value={stats?.events.toLocaleString()} 
          icon={Calendar} 
          color="bg-green-500" 
        />
        <StatCard 
          title="Pending Reports" 
          value={stats?.reports} 
          icon={AlertTriangle} 
          color="bg-red-500"
          subValue={stats?.reports ? "Requires attention" : "All clear!"}
        />
        <StatCard 
          title="Total Revenue" 
          value={`₦${(stats?.revenue || 0).toLocaleString()}`}
          icon={DollarSign} 
          color="bg-yellow-500" 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard 
          title="Premium Subscribers" 
          value={stats?.premiumUsers.toLocaleString()} 
          icon={TrendingUp} 
          color="bg-purple-500"
          subValue={`${((stats?.premiumUsers || 0) / (stats?.users || 1) * 100).toFixed(1)}% conversion`}
        />
        <StatCard 
          title="New Users (7d)" 
          value={stats?.newUsers.toLocaleString()} 
          icon={UserPlus} 
          color="bg-cyan-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>User Growth (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }} 
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="users" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary)/0.2)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${activity.type === 'user' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {activity.type === 'user' ? 'New user ' : 'Event '}
                        <strong className="truncate">{activity.name || 'Unknown'}</strong>
                        {activity.type === 'user' ? ' joined' : ' created'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(activity.time), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
