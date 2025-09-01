import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useSubscriptionSync } from '@/hooks/useSubscriptionSync';
import { cn } from '@/lib/utils';

interface SubscriptionSyncIndicatorProps {
  showButton?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SubscriptionSyncIndicator({ 
  showButton = false, 
  showTooltip = true,
  size = 'md',
  className 
}: SubscriptionSyncIndicatorProps) {
  const {
    syncHealth,
    getSyncStatusInfo,
    triggerSync,
    canManualSync,
    isLoading
  } = useSubscriptionSync();

  const syncInfo = getSyncStatusInfo();

  // Icon selection based on sync status
  const getStatusIcon = () => {
    const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
    
    if (isLoading || syncHealth.isPending) {
      return <Loader2 className={cn(iconSize, 'animate-spin')} />;
    }
    
    if (syncHealth.isHealthy) {
      return <CheckCircle className={cn(iconSize, 'text-green-600')} />;
    }
    
    if (syncHealth.needsAttention) {
      return <XCircle className={cn(iconSize, 'text-red-600')} />;
    }
    
    return <AlertTriangle className={cn(iconSize, 'text-yellow-600')} />;
  };

  // Badge variant based on sync health
  const getBadgeVariant = () => {
    if (syncHealth.isHealthy) return 'default';
    if (syncHealth.needsAttention) return 'destructive';
    return 'secondary';
  };

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-medium">Subscription Sync Status</div>
      <div className="text-sm">
        <div>Status: {syncInfo.statusText}</div>
        {syncInfo.retryCount > 0 && (
          <div>Retry count: {syncInfo.retryCount}</div>
        )}
        {syncInfo.minutesSinceSync !== null && (
          <div>Last sync: {syncInfo.minutesSinceSync} minutes ago</div>
        )}
        {!canManualSync && !isLoading && (
          <div className="text-yellow-600 mt-1">
            Sync in progress or recently completed
          </div>
        )}
      </div>
    </div>
  );

  const indicator = (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1">
        {getStatusIcon()}
        <Badge 
          variant={getBadgeVariant()}
          className={cn(
            'font-normal',
            size === 'sm' && 'text-xs px-2 py-0.5',
            size === 'lg' && 'text-sm px-3 py-1'
          )}
        >
          {syncInfo.statusText}
        </Badge>
      </div>
      
      {showButton && (
        <Button
          variant="ghost"
          size={size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'sm'}
          onClick={() => triggerSync()}
          disabled={!canManualSync || isLoading}
          className="p-1.5"
        >
          <RefreshCw className={cn(
            size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4',
            isLoading && 'animate-spin'
          )} />
          <span className="sr-only">Manual sync</span>
        </Button>
      )}
    </div>
  );

  if (!showTooltip) {
    return indicator;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {indicator}
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact version for use in headers/nav
export function CompactSyncIndicator({ className }: { className?: string }) {
  return (
    <SubscriptionSyncIndicator 
      size="sm"
      showButton={true}
      showTooltip={true}
      className={className}
    />
  );
}

// Detailed version for dashboards
export function DetailedSyncIndicator({ className }: { className?: string }) {
  const { getSyncStatusInfo, syncHealth } = useSubscriptionSync();
  const syncInfo = getSyncStatusInfo();
  
  return (
    <div className={cn('space-y-2', className)}>
      <SubscriptionSyncIndicator 
        size="md"
        showButton={true}
        showTooltip={false}
      />
      
      {/* Additional sync details */}
      <div className="text-sm text-muted-foreground space-y-1">
        {syncInfo.minutesSinceSync !== null && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last sync: {syncInfo.minutesSinceSync} minutes ago
          </div>
        )}
        
        {syncInfo.retryCount > 0 && (
          <div className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Retry attempts: {syncInfo.retryCount}
          </div>
        )}
        
        {syncHealth.needsAttention && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="h-3 w-3" />
            Requires attention
          </div>
        )}
      </div>
    </div>
  );
}