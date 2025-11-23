import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, AlertTriangle, DollarSign } from "lucide-react";

export default function AdminDashboard() {
  
  // 1. Fetch Stats (Parallel Queries)
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
      
      // C. Pending Reports (Assuming you have a reports table, or use placeholder if not yet created)
      // For now, let's simulate or check a reports table if it exists
      // const { count: reportCount } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const reportCount = 0; // Placeholder until table creation

      return {
        users: userCount || 0,
        events: eventCount || 0,
        reports: reportCount,
        revenue: 0 // Revenue would require summing the payments table
      };
    }
  });

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-full ${color} bg-opacity-10`}>
          <Icon className={`h-4 w-4 ${color.replace('bg-', 'text-')}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{isLoading ? "..." : value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          +20.1% from last month
        </p>
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
        />
        <StatCard 
          title="Total Revenue" 
          value={`₦${stats?.revenue}`} 
          icon={DollarSign} 
          color="bg-yellow-500" 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent User Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
              Chart Component Here
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* We will map real activity logs here later */}
              <div className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                <p className="text-sm">New user <strong>david_okne</strong> joined</p>
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                <p className="text-sm">Event <strong>Tech Meetup</strong> created</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
                
