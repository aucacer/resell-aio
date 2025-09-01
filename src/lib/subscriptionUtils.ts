import { supabase } from '@/integrations/supabase/client';
import type { 
  SubscriptionStatus, 
  SyncStatus, 
  PaymentMethodStatus, 
  EnhancedSubscriptionStatus,
  UserSubscription,
  PaymentEventLog,
  StripeEventData,
  ErrorDetails,
  SubscriptionMetadata
} from '@/types/subscription';

/**
 * Utility functions for subscription status management and sync operations
 */

// Retry configuration for sync operations
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export interface SubscriptionStatus {
  id: string
  user_id: string
  stripe_subscription_id: string | null
  subscription_status: string
  subscription_metadata: SubscriptionMetadata
  last_sync_at: string | null
  sync_status: 'synced' | 'pending' | 'failed' | 'retry_needed'
  payment_method_status: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface SubscriptionSyncResult {
  success: boolean
  syncStatus: 'synced' | 'failed' | 'retry_needed'
  error?: string
  lastSyncAt: string
}

// Get enhanced subscription status for a user
export async function getEnhancedSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  
  const { data, error } = await supabase
    .from('subscription_enhanced_status')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('Error fetching enhanced subscription status:', error)
    return null
  }

  return data
}

// Check if subscription sync is healthy
export async function isSubscriptionSyncHealthy(userId: string): Promise<boolean> {
  const status = await getEnhancedSubscriptionStatus(userId)
  
  if (!status) {
    return false
  }

  // Consider sync healthy if:
  // 1. Sync status is 'synced'
  // 2. Last sync was within the last 24 hours
  // 3. Retry count is 0 or low
  const now = new Date()
  const lastSync = status.last_sync_at ? new Date(status.last_sync_at) : null
  const hoursSinceLastSync = lastSync ? (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60) : Infinity

  return (
    status.sync_status === 'synced' &&
    hoursSinceLastSync <= 24 &&
    status.retry_count <= 2
  )
}

// Mark subscription as needing sync retry
export async function markSubscriptionForRetry(
  userId: string, 
  error?: string
): Promise<SubscriptionSyncResult> {
  
  const { error: updateError } = await supabase
    .from('subscription_enhanced_status')
    .update({
      sync_status: 'retry_needed',
      retry_count: supabase.raw('retry_count + 1'),
      subscription_metadata: supabase.raw(`subscription_metadata || '{"last_error": "${error || 'Unknown error'}", "error_timestamp": "${new Date().toISOString()}"}'::jsonb`),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  if (updateError) {
    console.error('Error marking subscription for retry:', updateError)
    return {
      success: false,
      syncStatus: 'failed',
      error: updateError.message,
      lastSyncAt: new Date().toISOString()
    }
  }

  return {
    success: true,
    syncStatus: 'retry_needed',
    lastSyncAt: new Date().toISOString()
  }
}

// Get subscriptions that need sync retry
export async function getSubscriptionsNeedingRetry(
  maxRetryCount: number = 3,
  retryDelayMinutes: number = 5
): Promise<SubscriptionStatus[]> {
  
  const retryAfter = new Date()
  retryAfter.setMinutes(retryAfter.getMinutes() - retryDelayMinutes)
  
  const { data, error } = await supabase
    .from('subscription_enhanced_status')
    .select('*')
    .eq('sync_status', 'retry_needed')
    .lt('retry_count', maxRetryCount)
    .lt('updated_at', retryAfter.toISOString())
    .order('updated_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Error fetching subscriptions needing retry:', error)
    return []
  }

  return data || []
}

// Verify subscription status with Stripe (fallback for webhook failures)
export async function verifySubscriptionWithStripe(
  userId: string,
  stripeSubscriptionId: string
): Promise<SubscriptionSyncResult> {
  // Note: This function would typically call a Supabase edge function
  // that has access to the Stripe API to verify the subscription status
  // For now, we'll mark it as needing verification
  
  return await markSubscriptionForRetry(userId, 'Manual verification needed')
}

// Update subscription sync status after successful operation
export async function markSubscriptionSynced(
  userId: string,
  metadata?: SubscriptionMetadata
): Promise<SubscriptionSyncResult> {
  
  const updateData: {
    sync_status: SyncStatus;
    last_sync_at: string;
    retry_count: number;
    updated_at: string;
    subscription_metadata?: SubscriptionMetadata;
  } = {
    sync_status: 'synced',
    last_sync_at: new Date().toISOString(),
    retry_count: 0,
    updated_at: new Date().toISOString()
  }

  if (metadata) {
    updateData.subscription_metadata = {
      ...(await getEnhancedSubscriptionStatus(userId))?.subscription_metadata,
      ...metadata,
      last_manual_sync: new Date().toISOString()
    }
  }

  const { error } = await supabase
    .from('subscription_enhanced_status')
    .update(updateData)
    .eq('user_id', userId)

  if (error) {
    console.error('Error marking subscription as synced:', error)
    return {
      success: false,
      syncStatus: 'failed',
      error: error.message,
      lastSyncAt: new Date().toISOString()
    }
  }

  return {
    success: true,
    syncStatus: 'synced',
    lastSyncAt: new Date().toISOString()
  }
}

// Get subscription sync health metrics for monitoring
export async function getSubscriptionSyncMetrics(): Promise<{
  total: number
  synced: number
  pending: number
  failed: number
  retryNeeded: number
  healthyPercentage: number
}> {
  
  const { data, error } = await supabase
    .from('subscription_enhanced_status')
    .select('sync_status')

  if (error) {
    console.error('Error fetching sync metrics:', error)
    return {
      total: 0,
      synced: 0,
      pending: 0,
      failed: 0,
      retryNeeded: 0,
      healthyPercentage: 0
    }
  }

  const total = data?.length || 0
  const synced = data?.filter(s => s.sync_status === 'synced').length || 0
  const pending = data?.filter(s => s.sync_status === 'pending').length || 0
  const failed = data?.filter(s => s.sync_status === 'failed').length || 0
  const retryNeeded = data?.filter(s => s.sync_status === 'retry_needed').length || 0
  const healthyPercentage = total > 0 ? (synced / total) * 100 : 0

  return {
    total,
    synced,
    pending,
    failed,
    retryNeeded,
    healthyPercentage: Math.round(healthyPercentage * 100) / 100
  }
}

// Check if user has valid subscription (integrates with existing subscription context)
export async function hasValidSubscription(userId: string): Promise<boolean> {
  
  // Check both the main subscription table and enhanced status
  const [mainSub, enhancedStatus] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select('status, current_period_end, trial_end')
      .eq('user_id', userId)
      .single(),
    getEnhancedSubscriptionStatus(userId)
  ])

  if (mainSub.error && !mainSub.data) {
    return false
  }

  const subscription = mainSub.data
  const now = new Date()
  
  // Check if subscription is active and not expired
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'
  const notExpired = subscription.current_period_end ? 
    new Date(subscription.current_period_end) > now : 
    (subscription.trial_end ? new Date(subscription.trial_end) > now : false)

  // Also verify sync health for enhanced monitoring
  const syncHealthy = enhancedStatus ? 
    enhancedStatus.sync_status === 'synced' && enhancedStatus.retry_count <= 3 : 
    true // Don't fail if enhanced status doesn't exist yet

  return isActive && notExpired && syncHealthy
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(retryCount: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Determine if a subscription status requires immediate attention
 */
export function isStatusCritical(status: SubscriptionStatus): boolean {
  return ['past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid'].includes(status);
}

/**
 * Get user-friendly status display text
 */
export function getStatusDisplayText(status: SubscriptionStatus): string {
  const statusMap: Record<SubscriptionStatus, string> = {
    active: 'Active',
    trialing: 'Trial Period',
    past_due: 'Payment Overdue',
    canceled: 'Canceled',
    incomplete: 'Incomplete Setup',
    incomplete_expired: 'Setup Expired',
    unpaid: 'Payment Required',
  };
  return statusMap[status] || status;
}

/**
 * Get sync status display text and color
 */
export function getSyncStatusDisplay(syncStatus: SyncStatus): { text: string; color: string } {
  const statusMap: Record<SyncStatus, { text: string; color: string }> = {
    synced: { text: 'Synced', color: 'text-green-600' },
    pending: { text: 'Syncing...', color: 'text-yellow-600' },
    failed: { text: 'Sync Failed', color: 'text-red-600' },
    retry_needed: { text: 'Retry Pending', color: 'text-orange-600' },
  };
  return statusMap[syncStatus] || { text: syncStatus, color: 'text-gray-600' };
}

/**
 * Check if subscription needs sync retry
 */
export function needsSyncRetry(
  syncStatus: SyncStatus, 
  retryCount: number, 
  lastSyncAt: string | null
): boolean {
  if (syncStatus === 'synced') return false;
  if (retryCount >= RETRY_CONFIG.maxRetries) return false;
  
  // Check if enough time has passed since last attempt
  if (lastSyncAt) {
    const lastSync = new Date(lastSyncAt);
    const now = new Date();
    const timeSinceSync = now.getTime() - lastSync.getTime();
    const requiredDelay = calculateBackoffDelay(retryCount);
    
    return timeSinceSync >= requiredDelay;
  }
  
  return true;
}

/**
 * Sync subscription status with Stripe
 */
export async function syncSubscriptionStatus(userId: string): Promise<{
  success: boolean;
  error?: string;
  enhancedStatus?: EnhancedSubscriptionStatus;
}> {
  try {
    console.log('🔄 Starting subscription sync for user:', userId);

    // Call the subscription sync edge function
    const { data, error } = await supabase.functions.invoke('subscription-sync', {
      body: { userId }
    });

    if (error) {
      console.error('❌ Subscription sync failed:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Subscription sync completed:', data);
    return { success: true, enhancedStatus: data };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Subscription sync error:', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update enhanced subscription status
 */
export async function updateEnhancedSubscriptionStatus(
  userId: string,
  updates: Partial<EnhancedSubscriptionStatus>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('subscription_enhanced_status')
      .upsert({
        user_id: userId,
        updated_at: new Date().toISOString(),
        ...updates,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Log payment event for audit trail
 */
export async function logPaymentEvent(
  userId: string,
  stripeEventId: string,
  eventType: string,
  eventData: StripeEventData,
  processingStatus: 'pending' | 'processed' | 'failed' | 'skipped' = 'pending'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('payment_event_log')
      .insert({
        event_id: crypto.randomUUID(),
        stripe_event_id: stripeEventId,
        event_type: eventType,
        event_data: eventData,
        processing_status: processingStatus,
        processed_at: processingStatus === 'processed' ? new Date().toISOString() : null,
        retry_count: 0,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Get payment event history for user
 */
export async function getPaymentEventHistory(
  userId: string,
  limit: number = 50
): Promise<{
  success: boolean;
  events?: PaymentEventLog[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('payment_event_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, events: data };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Validate subscription data consistency
 */
export function validateSubscriptionConsistency(
  userSubscription: UserSubscription | null,
  enhancedStatus: EnhancedSubscriptionStatus | null
): { isConsistent: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!userSubscription && !enhancedStatus) {
    return { isConsistent: true, issues: [] };
  }

  if (userSubscription && enhancedStatus) {
    // Check status consistency
    if (userSubscription.status !== enhancedStatus.subscription_status) {
      issues.push(`Status mismatch: ${userSubscription.status} vs ${enhancedStatus.subscription_status}`);
    }

    // Check Stripe subscription ID consistency
    if (userSubscription.stripe_subscription_id !== enhancedStatus.stripe_subscription_id) {
      issues.push(`Stripe ID mismatch: ${userSubscription.stripe_subscription_id} vs ${enhancedStatus.stripe_subscription_id}`);
    }
  }

  if (userSubscription && !enhancedStatus) {
    issues.push('Enhanced status missing for existing subscription');
  }

  if (!userSubscription && enhancedStatus) {
    issues.push('Enhanced status exists without base subscription');
  }

  return {
    isConsistent: issues.length === 0,
    issues,
  };
}