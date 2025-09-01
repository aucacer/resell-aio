import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  getEnhancedSubscriptionStatus,
  validateSubscriptionConsistency,
  getStatusDisplayText,
  isStatusCritical
} from '@/lib/subscriptionUtils';
import type { 
  EnhancedSubscriptionStatus, 
  UserSubscription,
  SubscriptionStatus 
} from '@/types/subscription';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';

/**
 * Enhanced subscription status hook with real-time sync monitoring
 */
export function useSubscriptionStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subscription: userSubscription } = useSubscriptionContext();

  // Enhanced subscription status from database
  const {
    data: enhancedStatus,
    error: enhancedError,
    isLoading: enhancedLoading,
    refetch: refetchEnhanced
  } = useQuery({
    queryKey: ['enhancedSubscriptionStatus', user?.id],
    queryFn: () => user ? getEnhancedSubscriptionStatus(user.id) : Promise.resolve({ success: false }),
    enabled: !!user,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute for real-time updates
    retry: 3
  });

  const [consistencyIssues, setConsistencyIssues] = useState<string[]>([]);

  // Validate data consistency between user subscription and enhanced status
  useEffect(() => {
    if (userSubscription && enhancedStatus?.status) {
      const validation = validateSubscriptionConsistency(
        userSubscription,
        enhancedStatus.status
      );
      setConsistencyIssues(validation.issues);

      // Show warning if inconsistencies are found
      if (!validation.isConsistent && validation.issues.length > 0) {
        console.warn('🔴 Subscription data inconsistency detected:', validation.issues);
        toast({
          title: 'Subscription Data Sync Issue',
          description: 'Some subscription data may be out of sync. Try refreshing or use manual sync.',
          variant: 'destructive',
          duration: 8000,
        });
      }
    }
  }, [userSubscription, enhancedStatus?.status, toast]);

  // Manual refresh function
  const refreshStatus = useCallback(async () => {
    if (!user) return;

    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enhancedSubscriptionStatus', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['subscription'] })
      ]);
    } catch (error) {
      console.error('Failed to refresh subscription status:', error);
    }
  }, [user, queryClient]);

  // Computed properties
  const currentStatus: SubscriptionStatus | null = enhancedStatus?.status?.subscription_status || userSubscription?.status || null;
  const syncStatus = enhancedStatus?.status?.sync_status || 'synced';
  const lastSyncAt = enhancedStatus?.status?.last_sync_at || null;
  const retryCount = enhancedStatus?.status?.retry_count || 0;
  const paymentMethodStatus = enhancedStatus?.status?.payment_method_status || 'valid';

  // Status display and health indicators
  const statusDisplay = currentStatus ? getStatusDisplayText(currentStatus) : 'Unknown';
  const isHealthy = syncStatus === 'synced' && retryCount <= 2 && consistencyIssues.length === 0;
  const requiresAttention = currentStatus ? isStatusCritical(currentStatus) : false;
  const hasSyncIssues = syncStatus !== 'synced' || retryCount > 0;

  // Time since last sync
  const timeSinceSync = lastSyncAt ? 
    Math.floor((new Date().getTime() - new Date(lastSyncAt).getTime()) / (1000 * 60)) : null;

  return {
    // Status data
    userSubscription,
    enhancedStatus: enhancedStatus?.status || null,
    currentStatus,
    statusDisplay,
    
    // Sync information
    syncStatus,
    lastSyncAt,
    retryCount,
    timeSinceSync,
    paymentMethodStatus,
    
    // Health indicators
    isHealthy,
    requiresAttention,
    hasSyncIssues,
    consistencyIssues,
    
    // Loading states
    isLoading: enhancedLoading,
    error: enhancedError,
    
    // Actions
    refreshStatus,
  };
}