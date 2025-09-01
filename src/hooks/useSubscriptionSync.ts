import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  syncSubscriptionStatus,
  calculateBackoffDelay,
  needsSyncRetry 
} from '@/lib/subscriptionUtils';
import type { SyncStatus } from '@/types/subscription';
import { useSubscriptionStatus } from './useSubscriptionStatus';

/**
 * Hook for managing subscription sync operations and manual triggers
 */
export function useSubscriptionSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { 
    syncStatus, 
    retryCount, 
    lastSyncAt, 
    hasSyncIssues 
  } = useSubscriptionStatus();

  const [syncInProgress, setSyncInProgress] = useState(false);

  // Manual sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      return await syncSubscriptionStatus(user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: 'Sync Successful ✅',
          description: 'Your subscription status has been synchronized with Stripe.',
          duration: 5000,
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['enhancedSubscriptionStatus', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    },
    onError: (error: any) => {
      console.error('Manual sync failed:', error);
      toast({
        title: 'Sync Failed ❌',
        description: error.message || 'Failed to sync subscription status. Please try again.',
        variant: 'destructive',
        duration: 8000,
      });
    },
    onSettled: () => {
      setSyncInProgress(false);
    }
  });

  // Manual sync trigger
  const triggerSync = useCallback(async (showProgress = true) => {
    if (syncMutation.isPending || syncInProgress) {
      console.log('Sync already in progress, skipping');
      return;
    }

    if (showProgress) {
      setSyncInProgress(true);
      toast({
        title: 'Syncing... 🔄',
        description: 'Synchronizing your subscription status with Stripe.',
        duration: 3000,
      });
    }

    syncMutation.mutate();
  }, [syncMutation, syncInProgress, toast]);

  // Auto-retry logic
  const shouldAutoRetry = needsSyncRetry(syncStatus, retryCount, lastSyncAt);
  const nextRetryDelay = calculateBackoffDelay(retryCount);
  const canManualSync = !syncMutation.isPending && !syncInProgress;

  // Sync health status
  const syncHealth = {
    isHealthy: syncStatus === 'synced' && retryCount === 0,
    needsAttention: syncStatus === 'failed' || retryCount >= 3,
    isPending: syncStatus === 'pending' || syncMutation.isPending || syncInProgress,
    canRetry: shouldAutoRetry && canManualSync,
  };

  // Get sync status display information
  const getSyncStatusInfo = useCallback(() => {
    const now = new Date();
    const lastSync = lastSyncAt ? new Date(lastSyncAt) : null;
    const minutesSinceSync = lastSync ? 
      Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60)) : null;

    let statusText = 'Unknown';
    let statusColor = 'text-gray-600';
    let canSync = canManualSync;

    if (syncMutation.isPending || syncInProgress) {
      statusText = 'Syncing...';
      statusColor = 'text-blue-600';
      canSync = false;
    } else {
      switch (syncStatus) {
        case 'synced':
          statusText = minutesSinceSync !== null ? 
            `Synced ${minutesSinceSync}m ago` : 'Synced';
          statusColor = 'text-green-600';
          break;
        case 'pending':
          statusText = 'Sync pending...';
          statusColor = 'text-yellow-600';
          canSync = false;
          break;
        case 'failed':
          statusText = `Sync failed (${retryCount} attempts)`;
          statusColor = 'text-red-600';
          break;
        case 'retry_needed':
          if (shouldAutoRetry) {
            statusText = `Retry in ${Math.ceil(nextRetryDelay / 1000)}s`;
            statusColor = 'text-orange-600';
          } else {
            statusText = `Manual sync needed`;
            statusColor = 'text-orange-600';
          }
          break;
        default:
          statusText = 'Sync status unknown';
          statusColor = 'text-gray-600';
      }
    }

    return {
      statusText,
      statusColor,
      canSync,
      minutesSinceSync,
      retryCount,
      shouldAutoRetry,
      nextRetryDelay
    };
  }, [
    syncStatus, 
    lastSyncAt, 
    retryCount, 
    syncMutation.isPending, 
    syncInProgress, 
    canManualSync, 
    shouldAutoRetry, 
    nextRetryDelay
  ]);

  return {
    // Sync status
    syncStatus,
    syncHealth,
    hasSyncIssues,
    
    // Sync actions
    triggerSync,
    canManualSync,
    
    // Sync state
    isLoading: syncMutation.isPending || syncInProgress,
    error: syncMutation.error,
    
    // Sync information
    getSyncStatusInfo,
    retryCount,
    lastSyncAt,
  };
}