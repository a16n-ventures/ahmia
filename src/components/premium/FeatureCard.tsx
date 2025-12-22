import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap } from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  billingPeriod: 'monthly' | 'yearly';
  isProcessing: boolean;
  isActive: boolean;
  onPurchase: () => void;
}

export const FeatureCard = ({
  icon,
  title,
  description,
  monthlyPrice,
  yearlyPrice,
  billingPeriod,
  isProcessing,
  isActive,
  onPurchase
}: FeatureCardProps) => {
  const price = billingPeriod === 'monthly' ? monthlyPrice : yearlyPrice;
  const yearlySavings = Math.round((monthlyPrice * 12 - yearlyPrice) / yearlyPrice * 100);

  return (
    <Card className="gradient-card shadow-card border-0 relative overflow-hidden hover:shadow-lg transition-shadow">
      {isActive && (
        <div className="absolute top-0 right-0 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
          ACTIVE
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="gradient-primary text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-sm">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base font-bold">{title}</CardTitle>
            <p className="text-xs text-muted-foreground leading-tight">{description}</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between border-t border-border/50 pt-3">
          <div>
            <span className="text-xl font-bold">₦{price.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground ml-1">
              /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
            </span>
          </div>
          {billingPeriod === 'yearly' && yearlySavings > 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px] px-1.5 h-5">
              -{yearlySavings}%
            </Badge>
          )}
        </div>
        
        <Button 
          className="w-full gradient-primary text-white shadow-sm h-9 text-sm"
          onClick={onPurchase}
          disabled={isProcessing || isActive}
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            'Active'
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Get This Feature
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
