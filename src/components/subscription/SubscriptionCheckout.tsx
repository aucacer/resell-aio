import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useSettings } from '@/contexts/UserSettingsContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCheckoutErrorMessage, getPortalErrorMessage, validatePaymentRequirements, formatErrorForLogging } from '@/lib/paymentErrorUtils';
import { formatDateByLocationCode } from '@/lib/dateUtils';
import { usePaymentState } from '@/hooks/usePaymentState';
import { Check, Star, Loader2, CreditCard, RefreshCw, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { SubscriptionPlan } from '@/types/subscription';

interface SubscriptionCheckoutProps {
  onSuccess?: () => void;
  showCurrentPlan?: boolean;
}

export function SubscriptionCheckout({ onSuccess, showCurrentPlan = true }: SubscriptionCheckoutProps) {
  const { user } = useAuth();
  const { plans, subscription, refreshSubscription, loading: subscriptionLoading, error: subscriptionError } = useSubscriptionContext();
  const { location } = useSettings();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const paymentState = usePaymentState();

  // Note: Portal return handling is now managed by Settings page via URL parameters

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    // Validate payment requirements
    const validationError = validatePaymentRequirements(user, plan);
    if (validationError) {
      toast({
        title: 'Cannot Process Payment',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    setLoading(plan.id);
    paymentState.actions.startPayment(plan.id);

    try {
      const currentOrigin = window.location.origin;
      console.log('Creating checkout session for plan:', plan.id, 'with origin:', currentOrigin);
      
      // Update progress
      paymentState.actions.updateProgress(50);
      
      // Create checkout session with timeout
      const checkoutPromise = supabase.functions.invoke('create-checkout-session', {
        body: {
          price_id: plan.stripe_price_id,
          success_url: `${currentOrigin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${currentOrigin}/settings`,
        },
      });
      
      // Add 20 second timeout for checkout session creation
      const { data, error } = await Promise.race([
        checkoutPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Checkout session creation timed out after 20 seconds')), 20000);
        }),
      ]);

      if (error) {
        console.error('Checkout session error:', error);
        throw error;
      }

      if (!data || !data.checkout_url) {
        console.error('Invalid checkout response:', data);
        throw new Error('Invalid response from checkout service - missing checkout URL');
      }

      console.log('Checkout session created, redirecting to:', data.checkout_url);
      
      // Update to redirecting state
      paymentState.actions.updateStep('redirecting');
      
      // Add a small delay to ensure UI updates are visible
      setTimeout(() => {
        window.location.href = data.checkout_url;
      }, 1000);
      
    } catch (error: any) {
      console.error('Checkout session failed:', formatErrorForLogging(error, 'checkout_session'));
      
      const errorInfo = getCheckoutErrorMessage(error);
      paymentState.actions.setError(errorInfo.message);
      
      toast({
        title: errorInfo.title,
        description: errorInfo.message,
        variant: 'destructive',
        duration: errorInfo.duration || 8000,
        action: errorInfo.action ? {
          label: 'Retry',
          onClick: () => handlePlanSelect(plan)
        } : undefined,
      });
    } finally {
      // Don't reset immediately on error - let user see the error state
      setTimeout(() => {
        setLoading(null);
        if (paymentState.step === 'failed') {
          // Let the payment state handle its own reset
        }
      }, 2000);
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
      
      const currentOrigin = window.location.origin;
      const response = await supabase.functions.invoke('create-portal-session', {
        body: {
          return_url: `${currentOrigin}/settings?portal_return=true`,
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
      
      // Add a small delay to ensure UI updates are visible
      setTimeout(() => {
        window.location.href = data.portal_url;
      }, 100);
      
    } catch (error: any) {
      console.error('Portal session failed:', formatErrorForLogging(error, 'customer_portal'));
      
      const errorInfo = getPortalErrorMessage(error);
      
      toast({
        title: errorInfo.title,
        description: errorInfo.message,
        variant: 'destructive',
        action: errorInfo.action ? {
          label: 'Retry',
          onClick: () => handleManageSubscription()
        } : undefined,
      });
    } finally {
      setLoading(null);
    }
  };

  const currentPlanId = subscription?.plan_id;

  // Enhanced debug logging for subscription data
  console.log('🔍 SubscriptionCheckout render:', { 
    showCurrentPlan, 
    subscription: subscription ? {
      id: subscription.id,
      plan_id: subscription.plan_id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at,
      current_period_end: subscription.current_period_end
    } : null,
    currentPlanId,
    shouldShowExpiring: subscription?.status === 'active' && subscription?.cancel_at_period_end,
    hasSubscriptionData: !!subscription
  });

  // Payment Progress Component
  const PaymentProgressContent = () => {
    const stepDescription = paymentState.getStepDescription();
    
    return (
      <div className="p-6 space-y-4">
        <div className="text-center">
          {paymentState.step === 'failed' ? (
            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          )}
          <h3 className="text-lg font-semibold">
            {stepDescription.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            {stepDescription.description}
          </p>
          {paymentState.error && (
            <p className="text-sm text-destructive mt-2">
              {paymentState.error}
            </p>
          )}
        </div>
        
        <div className="space-y-2">
          <Progress value={paymentState.progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={paymentState.isStepActive('creating') ? 'text-primary font-medium' : ''}>
              Creating
            </span>
            <span className={paymentState.isStepActive('redirecting') ? 'text-primary font-medium' : ''}>
              Redirecting
            </span>
            <span className={paymentState.isStepActive('processing') ? 'text-primary font-medium' : ''}>
              Processing
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Payment Progress Modal/Drawer */}
      {paymentState.isLoading && (
        isMobile ? (
          <Drawer open={paymentState.isLoading} onOpenChange={() => paymentState.actions.reset()}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Processing Payment</DrawerTitle>
              </DrawerHeader>
              <PaymentProgressContent />
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={paymentState.isLoading} onOpenChange={() => paymentState.actions.reset()}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Processing Payment</DialogTitle>
              </DialogHeader>
              <PaymentProgressContent />
            </DialogContent>
          </Dialog>
        )
      )}
      
      <div className="space-y-6">
      {showCurrentPlan && (
        <>
          {/* Loading State */}
          {subscriptionLoading && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Subscription...
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State with Retry */}
          {!subscriptionLoading && subscriptionError && !subscription && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Loader2 className="h-4 w-4" />
                  Unable to Load Subscription
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  There was an error loading your subscription data. This might be temporary.
                </p>
                <Button
                  onClick={() => refreshSubscription()}
                  variant="outline"
                  size="sm"
                >
                  <Loader2 className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Current Plan Display */}
          {!subscriptionLoading && subscription && (
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
                    <Badge variant="outline" className="border-amber-500 text-amber-500 bg-amber-50 dark:bg-amber-950">Expiring</Badge>
                  )}
                  {subscription.status === 'canceled' && (
                    <Badge variant="destructive">Cancelled</Badge>
                  )}
                  {subscription.status === 'past_due' && (
                    <Badge variant="destructive">Past Due</Badge>
                  )}
                  {subscription.status === 'unpaid' && (
                    <Badge variant="destructive">Unpaid</Badge>
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
                          : subscription.status === 'canceled'
                            ? 'Expired'
                          : subscription.cancel_at_period_end 
                            ? 'Expires' 
                            : 'Renews'
                        } on{' '}
                        {formatDateByLocationCode(subscription.current_period_end, location)}
                      </p>
                    )}
                    {subscription.cancel_at_period_end && subscription.canceled_at && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Cancelled on {formatDateByLocationCode(subscription.canceled_at, location)}
                      </p>
                    )}
                  </div>
                  <div>
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

          {/* No Subscription State (Free Users) */}
          {!subscriptionLoading && !subscriptionError && !subscription && (
            <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Star className="h-4 w-4" />
                  No Active Subscription
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
                  You're currently using the free version. Upgrade to unlock all premium features!
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {(() => {
        // Filter out free trial if user is on pro_monthly
        const displayPlans = subscription?.plan_id === 'pro_monthly' 
          ? plans.filter(plan => plan.id !== 'free_trial')
          : plans;

        return (
          <div className={`grid grid-cols-1 gap-8 ${displayPlans.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
            {displayPlans.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const isPro = plan.id === 'pro_monthly';
          
          return (
            <Card
              key={plan.id}
              className={`relative transition-all duration-200 ${
                isPro 
                  ? 'border-primary shadow-xl hover:shadow-2xl border-2' 
                  : 'hover:shadow-lg border border-border'
              } ${
                isCurrentPlan ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
            >
              {isPro && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg">
                    <Star className="h-4 w-4 fill-current" />
                    Most Popular
                  </div>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 -right-3 z-10">
                  <Badge className="bg-green-500 hover:bg-green-600 text-white shadow-lg">Current Plan</Badge>
                </div>
              )}

              <CardHeader className={`text-center ${isPro ? 'pt-12 pb-4' : isCurrentPlan ? 'pt-8 pb-4' : 'py-6'}`}>
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

              <CardContent className="space-y-6 px-6 pb-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePlanSelect(plan)}
                  disabled={loading === plan.id || isCurrentPlan || !plan.stripe_price_id}
                  className={`w-full h-12 font-semibold ${isPro ? 'bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg' : 'border-2'}`}
                  variant={isPro ? 'default' : 'outline'}
                  size="lg"
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
        );
      })()}
    </div>
    </>
  );
}