import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpRight, ShieldCheck, History } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminWallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Fetch Platform Wallet
  const { data: wallet } = useQuery({
    queryKey: ["admin-wallet", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_platform_wallet', true) // Ensure this is actually an admin wallet
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleWithdraw = async () => {
    if (!wallet || wallet.balance <= 0) return;
    setLoading(true);
    try {
      // Re-use the exact same edge function logic
      const { error } = await supabase.functions.invoke('request-payout', {
        body: { amount: wallet.balance }
      });

      if (error) throw error;
      toast.success("Admin withdrawal initiated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-wallet"] });
    } catch (e: any) {
      toast.error("Withdrawal failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) return null; // Don't render if not an admin/no wallet

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">Platform Revenue</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <p className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">
              Accumulated Platform Fees (2%)
            </p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold">
                ₦{wallet.balance.toLocaleString()}
              </span>
              <span className="text-sm text-gray-400">.00</span>
            </div>
            
            <Button 
              onClick={handleWithdraw}
              disabled={loading || wallet.balance <= 0}
              className="w-full bg-white text-black hover:bg-gray-200 font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <ArrowUpRight className="w-4 h-4 mr-2"/>}
              Withdraw to Admin Bank
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4" /> recent Fee Collections
            </CardTitle>
          </CardHeader>
          <CardContent className="h-40 flex items-center justify-center text-muted-foreground text-sm border-t border-dashed">
            Transaction history visualization would go here
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
