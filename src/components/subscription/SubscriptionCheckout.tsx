import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Check, Star, Loader2, CreditCard } from 'lucide-react';
import type { SubscriptionPlan } from '@/types/subscription';

interface SubscriptionCheckoutProps {
  onSuccess?: () => void;
  showCurrentPlan?: boolean;
}

export function SubscriptionCheckout({ onSuccess, showCurrentPlan = true }: SubscriptionCheckoutProps) {
  const { user } = useAuth();
  const { plans, subscription, refreshSubscription } = useSubscriptionContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  // Handle returning from Stripe Customer Portal
  useEffect(() => {
    let hasRefreshedOnFocus = false;

    const handleWindowFocus = async () => {
      // Check if user is returning from Stripe portal
      const isReturningFromPortal = localStorage.getItem('stripe_portal_active') === 'true';
      
      // Only refresh if we have a user and they were in the portal
      if (!hasRefreshedOnFocus && user && isReturningFromPortal) {
        hasRefreshedOnFocus = true;
        console.log('User returned from Stripe portal - refreshing subscription data');
        
        // Clear the portal flag
        localStorage.removeItem('stripe_portal_active');
        
        // Small delay to ensure any webhook processing has completed
        setTimeout(async () => {
          try {
            // First try to sync directly with Stripe to get the latest data
            console.log('Syncing subscription data directly with Stripe...');
            
            try {
              const { data, error } = await supabase.functions.invoke('sync-subscription');
              
              if (error) {
                console.log('Sync function failed, falling back to refresh:', error);
                throw error;
              }
              
              if (data?.success) {
                console.log('Subscription synced successfully:', data.data);
                
                // Now refresh the local subscription data
                await refreshSubscription();
                
                toast({
                  title: "Subscription Updated",
                  description: "Your subscription changes have been applied.",
                });
              } else {
                throw new Error(data?.error || 'Sync failed');
              }
            } catch (syncError) {
              console.log('Sync failed, using fallback refresh:', syncError);
              
              // Fallback to regular refresh
              await refreshSubscription();
              
              toast({
                title: "Subscription Updated",
                description: "Your subscription changes have been applied.",
              });
            }
          } catch (error) {
            console.error('Error refreshing subscription after portal return:', error);
            
            toast({
              title: "Error",
              description: "There was an issue updating your subscription. Please refresh the page.",
              variant: "destructive",
            });
          } finally {
            // Reset flag after a delay to allow future refreshes
            setTimeout(() => {
              hasRefreshedOnFocus = false;
            }, 5000);
          }
        }, 1500);
      }
    };

    // Add focus listener
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [user, refreshSubscription, toast]);

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to subscribe to this plan.',
        variant: 'destructive',
      });
      return;
    }

    if (!plan.stripe_price_id) {
      toast({
        title: 'Plan Unavailable',
        description: 'This plan is not available for purchase at this time. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(plan.id);

    try {
      const currentOrigin = window.location.origin;
      console.log('Creating checkout session for plan:', plan.id, 'with origin:', currentOrigin);
      
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          price_id: plan.stripe_price_id,
          success_url: `${currentOrigin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${currentOrigin}/settings`,
        },
      });

      if (error) {
        console.error('Checkout session error:', error);
        throw error;
      }

      if (!data || !data.checkout_url) {
        console.error('Invalid checkout response:', data);
        throw new Error('Invalid response from checkout service');
      }

      console.log('Checkout session created, redirecting to:', data.checkout_url);
      
      // Add a small delay to ensure UI updates are visible
      setTimeout(() => {
        window.location.href = data.checkout_url;
      }, 100);
      
    } catch (error: any) {
      console.error('Checkout session failed:', error);
      
      let errorMessage = 'Failed to create checkout session';
      let errorTitle = 'Checkout Error';
      
      // Handle specific error types
      if (error.message?.includes('Unauthorized')) {
        errorTitle = 'Session Expired';
        errorMessage = 'Your session has expired. Please refresh the page and try again.';
      } else if (error.message?.includes('Missing required field')) {
        errorTitle = 'Configuration Error';
        errorMessage = 'There is a configuration issue with this plan. Please contact support.';
      } else if (error.message?.includes('No such price')) {
        errorTitle = 'Plan Unavailable';
        errorMessage = 'This plan is no longer available. Please refresh the page and try another plan.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to manage your subscription.',
        variant: 'destructive',
      });
      return;
    }

    setLoading('manage');

    try {
      console.log('Creating portal session for user:', user.id);
      
      // Check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('No valid session found:', sessionError);
        throw new Error('Please refresh the page and log in again');
      }
      
      console.log('Using session token for portal creation:', {
        user_id: session.user.id,
        token_type: session.token_type,
        expires_at: session.expires_at
      });
      
      const response = await supabase.functions.invoke('create-portal-session', {
        body: {
          return_url: window.location.href,
        },
      });

      console.log('Portal session response:', response);

      if (response.error) {
        console.error('Portal session error details:', {
          error: response.error,
          data: response.data,
          status: response.error?.status,
          message: response.error?.message
        });
        
        // Try to extract more details from the response
        let errorMessage = response.error.message;
        if (response.data && typeof response.data === 'object') {
          if (response.data.error) {
            errorMessage = response.data.error;
          }
          if (response.data.details) {
            console.error('Additional error details:', response.data.details);
          }
        }
        
        const enhancedError = new Error(errorMessage);
        enhancedError.details = response.data;
        throw enhancedError;
      }

      const { data, error } = response;

      if (!data || !data.portal_url) {
        console.error('Invalid portal response:', data);
        throw new Error('Invalid response from portal service');
      }

      console.log('Portal session created, redirecting to:', data.portal_url);
      
      // Set flag to indicate user is going to portal
      localStorage.setItem('stripe_portal_active', 'true');
      
      // Add a small delay to ensure UI updates are visible
      setTimeout(() => {
        window.location.href = data.portal_url;
      }, 100);
      
    } catch (error: any) {
      console.error('Portal session failed:', error);
      
      let errorMessage = 'Failed to open customer portal';
      let errorTitle = 'Portal Error';
      
      // Handle specific error types
      if (error.message?.includes('customer portal is not enabled')) {
        errorTitle = 'Portal Not Configured';
        errorMessage = 'The customer portal is not enabled in Stripe. Please contact support.';
      } else if (error.message?.includes('configuration error')) {
        errorTitle = 'Configuration Error';
        errorMessage = 'There is a configuration issue with the payment system. Please contact support.';
      } else if (error.message?.includes('Unauthorized')) {
        errorTitle = 'Session Expired';
        errorMessage = 'Your session has expired. Please refresh the page and try again.';
      } else if (error.message?.includes('Missing Authorization')) {
        errorTitle = 'Authentication Error';
        errorMessage = 'Please refresh the page and log in again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const currentPlanId = subscription?.plan_id;

  return (
    <div className="space-y-6">
      {showCurrentPlan && subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current Plan
              {subscription.status === 'trialing' && (
                <Badge variant="secondary">Trial</Badge>
              )}
              {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                <Badge variant="default">Active</Badge>
              )}
              {subscription.status === 'active' && subscription.cancel_at_period_end && (
                <Badge variant="outline" className="border-amber-500 text-amber-500">Expiring</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {plans.find(p => p.id === subscription.plan_id)?.display_name || subscription.plan_id}
                </p>
                {subscription.current_period_end && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.status === 'trialing' 
                      ? 'Trial ends' 
                      : subscription.cancel_at_period_end 
                        ? 'Expires' 
                        : 'Renews'
                    } on{' '}
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleManageSubscription}
                  variant="outline"
                  disabled={loading === 'manage'}
                  className="min-w-[140px]"
                >
                  {loading === 'manage' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening Portal...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Manage Subscription
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const isPro = plan.id === 'pro_monthly';
          
          return (
            <Card
              key={plan.id}
              className={`relative ${isPro ? 'border-primary shadow-lg scale-105' : ''} ${
                isCurrentPlan ? 'ring-2 ring-primary' : ''
              }`}
            >
              {isPro && (
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1 shadow-md">
                    <Star className="h-4 w-4 fill-current" />
                    Most Popular
                  </div>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge>Current Plan</Badge>
                </div>
              )}

              <CardHeader className={`text-center ${isPro ? 'pt-10 pb-4' : ''}`}>
                <CardTitle className="text-xl">{plan.display_name}</CardTitle>
                <p className="text-muted-foreground">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold">
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground ml-2">/{plan.interval}</span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePlanSelect(plan)}
                  disabled={loading === plan.id || isCurrentPlan || !plan.stripe_price_id}
                  className={`w-full ${isPro ? 'bg-primary hover:bg-primary/90' : ''}`}
                  variant={isPro ? 'default' : 'outline'}
                >
                  {loading === plan.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : plan.stripe_price_id ? (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      {plan.price === 0 ? 'Start Free Trial' : `Subscribe for $${plan.price}`}
                    </>
                  ) : (
                    'Contact Sales'
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}