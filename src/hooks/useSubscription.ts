import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { UserSubscription, SubscriptionAccess, SubscriptionPlan } from '@/types/subscription';

// Enhanced error logging utility
const logSubscriptionError = (context: string, error: any, additionalData?: any) => {
  console.error(`❌ [useSubscription] ${context}:`, {
    error: error.message || error,
    code: error.code,
    details: error.details,
    hint: error.hint,
    ...additionalData
  });
};

// Utility function to create promises with timeout
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
};

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccess | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Refs to prevent race conditions and memory leaks
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<string>('');
  
  // Cleanup function
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }, []);

  const fetchSubscription = async (signal?: AbortSignal, retryAttempt = 0) => {
    if (authLoading) {
      console.log('⏳ Auth is still loading, skipping subscription fetch');
      return;
    }
    
    if (!user) {
      console.log('⚠️ No user found for subscription fetch after auth loading complete');
      if (isMountedRef.current) {
        setLoading(false);
        setError(null);
      }
      return;
    }

    const maxRetries = 3;
    
    try {
      setError(null);
      
      console.log(`📊 Fetching subscription for user ${user.id} (attempt ${retryAttempt + 1}/${maxRetries + 1})`);
      
      // Ensure we have a valid session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.warn('⚠️ Session error:', sessionError);
      }
      
      if (!sessionData?.session) {
        console.warn('⚠️ No valid session found, subscription query may fail');
      } else {
        console.log('✅ Valid session found for subscription query');
      }
      
      // First try - fetch user's subscription with timeout and abort signal
      const subscriptionPromise = supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans(*)
        `)
        .eq('user_id', user.id)
        .abortSignal(signal)
        .single();
        
      const { data: subscriptionData, error: subscriptionError } = await withTimeout(
        subscriptionPromise,
        10000,
        'Subscription fetch'
      );

      // Check if component is still mounted and request wasn't aborted
      if (!isMountedRef.current || signal?.aborted) {
        return;
      }

      // Enhanced debug logging
      console.log('🔍 Subscription fetch result:', { 
        subscriptionData, 
        subscriptionError, 
        errorCode: subscriptionError?.code,
        userId: user.id,
        retryAttempt
      });

      // Handle different error cases
      if (subscriptionError) {
        if (subscriptionError.code === 'PGRST116') {
          // No subscription found - this is expected for new users
          console.log('ℹ️ No subscription found - user may be on free trial or first-time user');
          setSubscription(null);
          return;
        }
        
        // Check if this is a session/auth error and we should retry (but only once)
        if ((subscriptionError.code === 'JWT_EXPIRED' || subscriptionError.message?.includes('JWT')) && retryAttempt === 0) {
          console.log(`⚠️ JWT/Auth error, retrying once in 1 second...`);
          
          if (!signal?.aborted && isMountedRef.current) {
            setTimeout(() => {
              if (!signal?.aborted && isMountedRef.current) {
                fetchSubscription(signal, 1);
              }
            }, 1000);
          }
          return;
        }
        
        throw subscriptionError;
      }

      // Special logging for cancellation states
      if (subscriptionData?.cancel_at_period_end) {
        console.log('🚨 CANCELLATION DETECTED in fetched data:', {
          cancel_at_period_end: subscriptionData.cancel_at_period_end,
          canceled_at: subscriptionData.canceled_at,
          status: subscriptionData.status,
          current_period_end: subscriptionData.current_period_end
        });
      }

      console.log('✅ Setting subscription data:', subscriptionData);
      setSubscription(subscriptionData);

      // Check subscription access if we have subscription data
      if (subscriptionData) {
        const accessPromise = supabase
          .rpc('check_subscription_access', { user_uuid: user.id })
          .abortSignal(signal);
          
        const { data: accessData, error: accessError } = await withTimeout(
          accessPromise,
          8000,
          'Subscription access check'
        );

        // Check again if component is still mounted and request wasn't aborted
        if (!isMountedRef.current || signal?.aborted) {
          return;
        }

        if (accessError) {
          logSubscriptionError('Access check failed', accessError, { userId: user.id });
          // Don't throw - access check failure shouldn't prevent subscription data from loading
          console.warn('⚠️ Subscription access check failed, using fallback:', accessError);
        } else if (accessData && accessData.length > 0) {
          setSubscriptionAccess(accessData[0]);
        }
      } else {
        // No subscription data, clear access
        setSubscriptionAccess(null);
      }
      
      // Reset retry count on success
      setRetryCount(0);
      
    } catch (error: any) {
      if (!isMountedRef.current || signal?.aborted) {
        return;
      }
      
      const errorMessage = error.message || 'Unknown error occurred';
      logSubscriptionError('Fetch subscription failed', error, { 
        userId: user.id,
        retryAttempt
      });
      
      // Simplified retry for network errors - only retry once
      if (retryAttempt === 0 && (
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.code === 'NETWORK_ERROR' ||
        error.code === 'TIMEOUT'
      )) {
        console.log(`🔄 Network error, retrying once in 3 seconds...`);
        
        if (!signal?.aborted && isMountedRef.current) {
          setTimeout(() => {
            if (!signal?.aborted && isMountedRef.current) {
              fetchSubscription(signal, 1);
            }
          }, 3000);
        }
        return;
      }
      
      setError(errorMessage);
      
      // Show toast only for persistent errors after retry
      if (retryAttempt > 0) {
        console.log('❌ Subscription fetch failed after retry, showing error toast');
        toast({
          title: 'Error loading subscription',
          description: 'Unable to load subscription data. Please try refreshing the page or using the sync button.',
          variant: 'destructive',
          duration: 8000,
        });
      }
    }
  };

  const fetchPlans = async (signal?: AbortSignal) => {
    try {
      const plansPromise = supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price')
        .abortSignal(signal);
        
      const { data: plansData, error: plansError } = await withTimeout(
        plansPromise,
        8000,
        'Plans fetch'
      );

      if (!isMountedRef.current || signal?.aborted) {
        return;
      }

      if (plansError) throw plansError;

      setPlans(plansData || []);
    } catch (error: any) {
      if (!isMountedRef.current || signal?.aborted) {
        return;
      }
      
      logSubscriptionError('Fetch plans failed', error);
      
      // Plans fetch failure is less critical - use fallback
      console.warn('⚠️ Failed to fetch plans, using empty array as fallback:', error);
      setPlans([]);
      
      // Only show toast for critical plan loading errors
      if (error.message?.includes('network') || error.message?.includes('timeout')) {
        toast({
          title: 'Network Error',
          description: 'Unable to load subscription plans. Please check your connection.',
          variant: 'destructive',
          duration: 5000,
        });
      }
    }
  };

  const refreshSubscription = useCallback(async () => {
    console.log('🔄 refreshSubscription called, authLoading:', authLoading, 'user:', !!user);
    
    // Don't refresh if auth is still loading
    if (authLoading) {
      console.log('⏳ Skipping refresh - auth is still loading');
      return;
    }
    
    // Cancel any ongoing requests
    cleanup();
    
    // Create new abort controller for this refresh
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }
    
    try {
      await Promise.all([
        fetchSubscription(signal), 
        fetchPlans(signal)
      ]);
    } catch (error: any) {
      if (!signal.aborted && isMountedRef.current) {
        logSubscriptionError('Refresh failed', error);
        setError('Failed to refresh subscription data');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    }
  }, [authLoading, user]); // Include dependencies to track auth state changes

  useEffect(() => {
    isMountedRef.current = true;
    
    // Don't start fetching until auth loading is complete
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting before subscription fetch');
      return;
    }
    
    if (user) {
      console.log('✅ Auth loaded, user found, starting subscription fetch');
      refreshSubscription();
      
      // Set up real-time subscription listener
      console.log('🔊 Setting up realtime subscription listener for user:', user.id);
      
      const subscriptionChannel = supabase
        .channel('user_subscriptions_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_subscriptions',
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            console.log('🔄 Realtime subscription update detected:', payload);
            
            // Create a unique identifier for this update to debounce rapid successive updates
            const updateId = `${payload.eventType}-${payload.new?.id}-${payload.new?.updated_at}`;
            
            // Skip if this is the same update we just processed
            if (lastUpdateRef.current === updateId) {
              console.log('🔄 Skipping duplicate update:', updateId);
              return;
            }
            
            lastUpdateRef.current = updateId;
            
            // Clear any pending debounced update
            if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
            }
            
            // Debounce updates to prevent rapid successive processing
            debounceTimeoutRef.current = setTimeout(async () => {
              if (!isMountedRef.current) return;
              
              try {
                console.log('🔄 Processing debounced realtime update...', updateId);
                
                // Show toast notification for significant changes BEFORE fetching
                if (payload.eventType === 'UPDATE') {
                  const newData = payload.new as any;
                  const oldData = payload.old as any;
                  
                  console.log('📊 Realtime update details:', {
                    updateId,
                    old: {
                      cancel_at_period_end: oldData?.cancel_at_period_end,
                      canceled_at: oldData?.canceled_at,
                      status: oldData?.status,
                      plan_id: oldData?.plan_id
                    },
                    new: {
                      cancel_at_period_end: newData?.cancel_at_period_end,
                      canceled_at: newData?.canceled_at,
                      status: newData?.status,
                      plan_id: newData?.plan_id
                    }
                  });
                  
                  // Check for plan changes (only for upgrades to paid plans)
                  if (oldData?.plan_id !== newData?.plan_id && newData?.plan_id !== 'free_trial') {
                    console.log(`🎆 Plan changed from ${oldData?.plan_id} to ${newData?.plan_id}`);
                    
                    if (newData?.status === 'active') {
                      const planName = newData.plan_id?.replace('_', ' ').toUpperCase() || 'subscription';
                      toast({
                        title: 'Subscription Activated! 🎉',
                        description: `Your ${planName} subscription is now active.`,
                        duration: 6000,
                      });
                    }
                  }
                }
                
                // Always refresh subscription data after realtime update
                await fetchSubscription();
                
                // Handle toast notifications after data is refreshed
                if (payload.eventType === 'UPDATE') {
                  const newData = payload.new as any;
                  const oldData = payload.old as any;
                  
                  // Check for cancellation changes
                  if (oldData?.cancel_at_period_end !== newData?.cancel_at_period_end) {
                    if (newData?.cancel_at_period_end) {
                      const expiryDate = newData?.current_period_end 
                        ? new Date(newData.current_period_end).toLocaleDateString()
                        : 'end of billing period';
                      const planName = newData?.plan_id?.replace('_', ' ').toUpperCase() || 'subscription';
                      
                      toast({
                        title: 'Subscription Cancelled ❌',
                        description: `Your ${planName} subscription has been cancelled. You'll continue to have access until ${expiryDate}. You can reactivate anytime from the customer portal.`,
                        duration: 10000,
                        variant: 'destructive',
                      });
                    } else {
                      const planName = newData?.plan_id?.replace('_', ' ').toUpperCase() || 'subscription';
                      toast({
                        title: 'Subscription Reactivated ✅',
                        description: `Great news! Your ${planName} subscription has been reactivated and will continue to renew automatically.`,
                        duration: 8000,
                      });
                    }
                  }
                  
                  // Check for critical status changes that users need to know about
                  if (oldData?.status !== newData?.status) {
                    const planName = newData?.plan_id?.replace('_', ' ').toUpperCase() || 'subscription';
                    
                    // Only show toasts for critical status changes
                    if (newData?.status === 'past_due') {
                      toast({
                        title: 'Payment Issue ⚠️',
                        description: `Your ${planName} subscription payment is past due. Please update your payment method.`,
                        duration: 12000,
                        variant: 'destructive',
                      });
                    } else if (newData?.status === 'unpaid') {
                      toast({
                        title: 'Payment Required 💳',
                        description: `Your ${planName} subscription is unpaid. Please update your payment method to restore access.`,
                        duration: 15000,
                        variant: 'destructive',
                      });
                    } else if (newData?.status === 'canceled') {
                      toast({
                        title: 'Subscription Ended ❌',
                        description: `Your ${planName} subscription has ended. You can restart anytime by choosing a new plan.`,
                        duration: 10000,
                        variant: 'destructive',
                      });
                    }
                    // Note: Removed the 'active' status toast to avoid duplicate notifications
                    // The PaymentSuccessHandler already shows activation messages
                  }
                }
              } catch (error: any) {
                logSubscriptionError('Realtime update handling failed', error, { updateId });
              } finally {
                // Clear the debounce timeout reference
                debounceTimeoutRef.current = null;
              }
            }, 1000); // Increased debounce delay to 1 second
          }
        )
        .subscribe((status) => {
          console.log('🔊 Subscription channel status:', status);
          
          if (status === 'SUBSCRIPTION_ERROR') {
            logSubscriptionError('Realtime subscription error', { status });
          }
        });
      
      // Cleanup function
      return () => {
        console.log('🧹 Cleaning up subscription realtime listener');
        isMountedRef.current = false;
        cleanup();
        subscriptionChannel.unsubscribe();
      };
    } else if (!authLoading) {
      console.log('⚠️ No user found after auth loading complete');
      setSubscription(null);
      setSubscriptionAccess(null);
      setError(null);
      setLoading(false);
      setInitialLoadComplete(true);
    }
    
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [user, authLoading]);

  // Calculate derived properties - use fallback logic for hasAccess to prevent flashing
  const hasAccess = subscriptionAccess?.has_access ?? (
    // During initial load, default to true to prevent flash of "no access" state
    !initialLoadComplete ? true : (
      // Fallback: if subscription data exists, calculate access directly
      subscription ? (
        subscription.status === 'active' || 
        subscription.status === 'trialing' || 
        (subscription.status === 'past_due' && 
         subscription.current_period_end && 
         new Date(subscription.current_period_end) > new Date())
      ) : true // Default to true to prevent blocking users
    )
  );
  const isTrialing = subscription?.status === 'trialing';
  
  const daysUntilExpiry = subscription?.current_period_end 
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const inventoryLimit = subscriptionAccess?.max_inventory_items;

  // Check if user can add inventory (async function for real-time checking)
  const checkCanAddInventory = async (): Promise<boolean> => {
    if (!user || !inventoryLimit) return true; // No limit for unlimited plans

    try {
      const inventoryPromise = supabase
        .rpc('get_user_inventory_count', { user_uuid: user.id });
        
      const { data: inventoryCount, error } = await withTimeout(
        inventoryPromise,
        5000,
        'Inventory count check'
      );

      if (error) {
        logSubscriptionError('Inventory limit check failed', error, { userId: user.id });
        throw error;
      }

      return inventoryCount < inventoryLimit;
    } catch (error: any) {
      logSubscriptionError('Inventory limit check error', error, { 
        userId: user.id,
        inventoryLimit 
      });
      // Return false (conservative approach) when we can't verify the limit
      return false;
    }
  };

  return {
    subscription,
    subscriptionAccess,
    plans,
    loading,
    error,
    refreshSubscription,
    hasAccess,
    isTrialing,
    daysUntilExpiry,
    inventoryLimit,
    checkCanAddInventory,
    retryCount,
    initialLoadComplete,
  };
}