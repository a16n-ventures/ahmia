import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { InterestSelector } from "@/components/onboarding/InterestSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Apply pending referral code after signup
  useEffect(() => {
    const applyReferral = async () => {
      if (!user?.id) return;
      const code = localStorage.getItem('pending_referral_code');
      if (!code) return;

      try {
        // Find referrer
        const { data: referrer } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('referral_code', code.toUpperCase())
          .single();

        if (referrer && referrer.user_id !== user.id) {
          // Check if already referred
          const { data: existing } = await supabase
            .from('referrals')
            .select('id')
            .eq('referred_id', user.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from('referrals').insert({
              referrer_id: referrer.user_id,
              referred_id: user.id,
              referral_code: code.toUpperCase(),
              status: 'completed',
              completed_at: new Date().toISOString(),
            });
            toast.success("Referral code applied! 🎉");
          }
        }
      } catch (e) {
        console.error('Referral apply error:', e);
      } finally {
        localStorage.removeItem('pending_referral_code');
      }
    };

    applyReferral();
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Back button */}
      <Button 
        variant="ghost" 
        className="absolute top-4 left-4 z-10" 
        onClick={() => navigate('/')}
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <Card className="w-full max-w-lg shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl animate-in zoom-in-95 duration-300">
        <CardContent className="p-0">
          <InterestSelector 
            onComplete={() => {
              navigate('/app/feed', { replace: true});
            }}
          />
        </CardContent>
      </Card>
      
      <p className="mt-6 text-xs text-muted-foreground text-center max-w-sm">
        Your choices define your experience. You can change these later in Settings.
      </p>
    </div>
  );
}
