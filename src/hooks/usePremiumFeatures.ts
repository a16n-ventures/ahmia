import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PremiumFeatureType = 
  | 'full_package' 
  | 'profile_boost' 
  | 'event_boost' 
  | 'profile_badge';

interface PremiumFeature {
  feature_type: PremiumFeatureType;
  expires_at: string;
  days_remaining: number;
}

export const usePremiumFeatures = (userId?: string) => {
  return useQuery({
    queryKey: ['premium-features', userId],
    queryFn: async (): Promise<PremiumFeature[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .rpc('get_user_premium_features', { p_user_id: userId });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 60000, // Cache for 1 minute
  });
};

// Helper function to check specific feature
export const useHasFeature = (userId?: string, featureType?: PremiumFeatureType) => {
  const { data: features = [] } = usePremiumFeatures(userId);
  
  // Full package gives access to everything
  const hasFullPackage = features.some(f => f.feature_type === 'full_package');
  
  if (!featureType) return hasFullPackage;
  
  return hasFullPackage || features.some(f => f.feature_type === featureType);
};
