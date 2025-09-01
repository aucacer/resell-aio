import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Zap } from 'lucide-react';

interface InventoryLimitBannerProps {
  currentCount: number;
}

export function InventoryLimitBanner({ currentCount }: InventoryLimitBannerProps) {
  const { inventoryLimit, isTrialing, daysUntilExpiry } = useSubscriptionContext();
  const navigate = useNavigate();

  // Don't show banner if no limit (unlimited plan)
  if (!inventoryLimit) return null;

  const isNearLimit = currentCount >= inventoryLimit * 0.8; // Show when 80% of limit reached
  const isAtLimit = currentCount >= inventoryLimit;

  // Don't show if not near limit
  if (!isNearLimit) return null;

  const remainingItems = Math.max(0, inventoryLimit - currentCount);

  return (
    <Card className={`mb-6 border-l-4 ${isAtLimit ? 'border-l-destructive' : 'border-l-warning'}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 mt-0.5 ${isAtLimit ? 'text-destructive' : 'text-warning'}`} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">Inventory Limit Warning</h3>
                {isTrialing && (
                  <Badge variant="secondary">Trial Account</Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">
                {isAtLimit ? (
                  <>You've reached your inventory limit of {inventoryLimit} items.</>
                ) : (
                  <>You have {remainingItems} item slots remaining out of {inventoryLimit} total.</>
                )}
                {isTrialing && daysUntilExpiry !== null && (
                  <> Your trial expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}.</>
                )}
              </p>

              <div className="w-full bg-secondary rounded-full h-2 mb-3">
                <div 
                  className={`h-2 rounded-full transition-all ${
                    isAtLimit ? 'bg-destructive' : 'bg-warning'
                  }`}
                  style={{ width: `${Math.min(100, (currentCount / inventoryLimit) * 100)}%` }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Upgrade to Pro for unlimited inventory items and advanced features.
              </p>
            </div>
          </div>

          <Button
            onClick={() => navigate('/settings')}
            size="sm"
            className="ml-4"
          >
            <Zap className="mr-2 h-4 w-4" />
            Upgrade Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}