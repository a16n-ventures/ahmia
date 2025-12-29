import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { X, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AdvertData {
  id: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
}

export const AdvertBanner = () => {
  const { user } = useAuth();
  const [advert, setAdvert] = useState<AdvertData | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkPremiumAndFetchAd = async () => {
      // Check if user has premium
      const { data: premiumData } = await supabase
        .from('premium_features')
        .select('feature_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('feature_type', ['full_package'])
        .maybeSingle();

      setIsPremium(!!premiumData);

      // Only fetch ads if not premium
      if (!premiumData) {
        const { data: advertData } = await supabase
          .from('advertisements')
          .select('*')
          .eq('is_active', true)
          .eq('placement', 'bottom_banner')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (advertData) {
          setAdvert(advertData);
        }
      }
    };

    checkPremiumAndFetchAd();
  }, [user]);

  if (isPremium || !advert || !isVisible) return null;

  return (
    <Card className="fixed bottom-16 left-0 right-0 z-40 mx-4 mb-2 border-primary/20 shadow-lg bg-card/95 backdrop-blur-sm animate-in slide-in-from-bottom-2">
      <div className="relative p-3">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors z-10"
          aria-label="Close advertisement"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <a
          href={advert.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 group"
        >
          {advert.image_url && (
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img
                src={advert.image_url}
                alt={advert.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                {advert.title}
              </h4>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                Ad
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {advert.description}
            </p>
          </div>

          <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </a>
      </div>
    </Card>
  );
};
