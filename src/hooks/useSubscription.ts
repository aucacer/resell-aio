import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { UserSubscription, SubscriptionAccess, SubscriptionPlan } from '@/types/subscription';

export function useSubscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccess | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user's subscription
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans(*)
        `)
        .eq('user_id', user.id)
        .single();

      if (subscriptionError && subscriptionError.code !== 'PGRST116') {
        throw subscriptionError;
      }

      setSubscription(subscriptionData);

      // Check subscription access
      if (subscriptionData) {
        const { data: accessData, error: accessError } = await supabase
          .rpc('check_subscription_access', { user_uuid: user.id });

        if (accessError) throw accessError;

        if (accessData && accessData.length > 0) {
          setSubscriptionAccess(accessData[0]);
        }
      }
    } catch (error: any) {
      console.error('Error fetching subscription:', error);
      toast({
        title: 'Error loading subscription',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchPlans = async () => {
    try {
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price');

      if (plansError) throw plansError;

      setPlans(plansData || []);
    } catch (error: any) {
      console.error('Error fetching plans:', error);
      toast({
        title: 'Error loading plans',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const refreshSubscription = async () => {
    setLoading(true);
    await Promise.all([fetchSubscription(), fetchPlans()]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      refreshSubscription();
    } else {
      setSubscription(null);
      setSubscriptionAccess(null);
      setLoading(false);
    }
  }, [user]);

  // Calculate derived properties
  const hasAccess = subscriptionAccess?.has_access || false;
  const isTrialing = subscription?.status === 'trialing';
  
  const daysUntilExpiry = subscription?.current_period_end 
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const inventoryLimit = subscriptionAccess?.max_inventory_items;

  // Check if user can add inventory (async function for real-time checking)
  const checkCanAddInventory = async (): Promise<boolean> => {
    if (!user || !inventoryLimit) return true; // No limit for unlimited plans

    try {
      const { data: inventoryCount, error } = await supabase
        .rpc('get_user_inventory_count', { user_uuid: user.id });

      if (error) throw error;

      return inventoryCount < inventoryLimit;
    } catch (error) {
      console.error('Error checking inventory limit:', error);
      return false;
    }
  };

  return {
    subscription,
    subscriptionAccess,
    plans,
    loading,
    refreshSubscription,
    hasAccess,
    isTrialing,
    daysUntilExpiry,
    inventoryLimit,
    checkCanAddInventory,
  };
}