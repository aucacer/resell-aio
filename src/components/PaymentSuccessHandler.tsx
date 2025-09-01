import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentState } from '@/hooks/usePaymentState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';

export function PaymentSuccessHandler() {
  const { user } = useAuth();
  const { refreshSubscription, subscription } = useSubscriptionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [hasProcessed, setHasProcessed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [activationComplete, setActivationComplete] = useState(false);
  const [activationFailed, setActivationFailed] = useState(false);
  const [planName, setPlanName] = useState('');
  const [successDisplayStartTime, setSuccessDisplayStartTime] = useState<number | null>(null);
  const paymentState = usePaymentState();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    const handlePaymentSuccess = async () => {
      const success = searchParams.get('success');
      const sessionId = searchParams.get('session_id');
      
      // Only process once and only if we have the success parameter
      if (success !== 'true' || !user || hasProcessed) {
        return;
      }
      
      setHasProcessed(true);
      console.log('🎉 Processing payment success for session:', sessionId);
      
      // Show success modal instead of just toast
      setShowSuccessModal(true);
      paymentState.actions.updateStep('processing');
      
      // Clean up URL parameters immediately
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('success');
      newSearchParams.delete('session_id');
      setSearchParams(newSearchParams, { replace: true });
      
      // Progressive activation with clear status updates
      let attempt = 0;
      const maxAttempts = 4;
      const delays = [0, 2000, 4000, 8000]; // 0s, 2s, 4s, 8s
      
      for (attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          console.log(`🔄 Activation attempt ${attempt + 1}/${maxAttempts}`);
          
          // Show progress to user
          if (attempt > 0) {
            toast({
              title: `🔄 Finalizing subscription (${attempt + 1}/${maxAttempts})...`,
              description: "Please wait while we complete your subscription setup.",
              duration: 3000,
            });
          }
          
          // Wait for the specified delay
          if (delays[attempt] > 0) {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          }
          
          // First try our new RPC function for immediate verification
          const { data: verifyData, error: verifyError } = await supabase
            .rpc('verify_checkout_session', { 
              user_uuid: user.id,
              session_id: sessionId 
            });
          
          if (verifyError) {
            console.error('RPC verify failed:', verifyError);
          } else if (verifyData?.found && verifyData.subscription) {
            const sub = verifyData.subscription;
            console.log('✅ Subscription verified:', sub);
            
            // Check if it's an active paid subscription
            if (sub.status === 'active' && sub.plan_id !== 'free_trial') {
              // Refresh the subscription context
              await refreshSubscription();
              
              // Show success message
              const formattedPlanName = sub.plan_id.replace('_', ' ').toUpperCase();
              setPlanName(formattedPlanName);
              setActivationComplete(true);
              setSuccessDisplayStartTime(Date.now());
              paymentState.actions.completePayment();
              
              console.log('🎯 Subscription activation complete!');
              
              // Show success toast to ensure user sees confirmation
              toast({
                title: "🎉 Payment Successful!",
                description: `Welcome to ${formattedPlanName}! Your subscription is now active.`,
                duration: 8000,
              });
              
              return;
            }
          }
          
          // If RPC didn't work, try the sync function
          const session = await supabase.auth.getSession();
          if (session.data.session?.access_token) {
            const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-subscription', {
              headers: {
                Authorization: `Bearer ${session.data.session.access_token}`,
              },
            });
            
            if (!syncError && syncData?.success && syncData.data) {
              const sub = syncData.data;
              console.log('✅ Sync successful:', sub);
              
              if (sub.status === 'active' && sub.plan_id !== 'free_trial') {
                await refreshSubscription();
                
                const formattedPlanName = sub.plan_id.replace('_', ' ').toUpperCase();
                setPlanName(formattedPlanName);
                setActivationComplete(true);
                setSuccessDisplayStartTime(Date.now());
                paymentState.actions.completePayment();
                
                console.log('🎯 Subscription activation complete via sync!');
                
                // Show success toast to ensure user sees confirmation
                toast({
                  title: "🎉 Payment Successful!",
                  description: `Welcome to ${formattedPlanName}! Your subscription is now active.`,
                  duration: 8000,
                });
                
                return;
              }
            } else {
              console.error('Sync failed:', syncError || 'No data returned');
            }
          }
          
        } catch (error) {
          console.error(`Attempt ${attempt + 1} failed:`, error);
        }
      }
      
      // If we get here, all attempts failed
      console.log('❌ All activation attempts failed');
      setActivationFailed(true);
      toast({
        title: "Activation Taking Longer Than Expected",
        description: "Your payment was successful! Please refresh the page in a moment to see your Pro subscription.",
        variant: "default",
        duration: 10000,
      });
    };
    
    handlePaymentSuccess().catch(error => {
      console.error('Payment success handler failed:', error);
      if (!hasProcessed) {
        setHasProcessed(true);
        setActivationFailed(true);
        toast({
          title: "Activation Issue",
          description: "Your payment was processed successfully. Please refresh the page to see your subscription status.",
          variant: "destructive",
          duration: 10000,
        });
      }
    });
  }, [searchParams, user, hasProcessed, refreshSubscription, toast, setSearchParams, paymentState.actions]);

  // Auto-close success modal after showing success state for a few seconds
  useEffect(() => {
    if (activationComplete && successDisplayStartTime) {
      const timer = setTimeout(() => {
        setShowSuccessModal(false);
        navigate('/dashboard', { replace: true });
      }, 5000); // Auto-close after 5 seconds

      return () => clearTimeout(timer);
    }
  }, [activationComplete, successDisplayStartTime, navigate]);

  const handleContinue = async () => {
    // Ensure success modal shows for at least 3 seconds
    if (successDisplayStartTime) {
      const elapsed = Date.now() - successDisplayStartTime;
      const minDisplayTime = 3000; // 3 seconds
      if (elapsed < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
      }
    }
    
    setShowSuccessModal(false);
    // Navigate to dashboard or close modal
    navigate('/dashboard', { replace: true });
  };

  const handleViewFeatures = async () => {
    // Ensure success modal shows for at least 3 seconds
    if (successDisplayStartTime) {
      const elapsed = Date.now() - successDisplayStartTime;
      const minDisplayTime = 3000; // 3 seconds
      if (elapsed < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
      }
    }
    
    setShowSuccessModal(false);
    navigate('/dashboard');
  };

  const handleManualRefresh = async () => {
    console.log('🔄 Manual refresh triggered');
    setActivationFailed(false);
    try {
      await refreshSubscription();
      if (subscription?.status === 'active' && subscription?.plan_id !== 'free_trial') {
        const formattedPlanName = subscription.plan_id.replace('_', ' ').toUpperCase();
        setPlanName(formattedPlanName);
        setActivationComplete(true);
        paymentState.actions.completePayment();
        toast({
          title: "✅ Subscription Activated!",
          description: "Your Pro subscription is now active.",
          duration: 5000,
        });
      } else {
        toast({
          title: "Still processing...",
          description: "Your subscription is still being set up. Please try refreshing the page.",
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Manual refresh failed:', error);
      toast({
        title: "Refresh failed",
        description: "Please try refreshing the page manually.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const SharedContent = () => (
    <div className="text-center space-y-6">
      {/* Success Animation */}
      <div className="relative">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
          {activationComplete ? (
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          ) : (
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          )}
        </div>
        {activationComplete && (
          <div className="absolute -top-2 -right-2">
            <Sparkles className="w-6 h-6 text-yellow-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* Features Highlight */}
      {activationComplete && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-sm">What's unlocked:</h4>
          <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Unlimited inventory items</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Advanced profit tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Priority customer support</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {activationComplete && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={handleViewFeatures}
            className="flex-1"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Explore Features
          </Button>
          <Button 
            onClick={handleContinue}
            variant="outline"
            className="flex-1"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Manual refresh button when activation fails */}
      {activationFailed && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Your payment was successful, but subscription activation is taking longer than expected.
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={handleManualRefresh}
              variant="outline"
              className="flex-1"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button 
              onClick={handleContinue}
              className="flex-1"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Progress indicator for processing */}
      {!activationComplete && !activationFailed && (
        <div className="text-sm text-muted-foreground">
          This usually takes just a few seconds...
        </div>
      )}
    </div>
  );

  const DialogSuccessContent = () => (
    <>
      <DialogHeader>
        <DialogTitle className="text-center">
          {activationComplete ? 'Subscription Activated!' : activationFailed ? 'Payment Successful!' : 'Processing Payment...'}
        </DialogTitle>
        <DialogDescription className="text-center">
          {activationComplete 
            ? `Welcome to ${planName}! Your subscription is now active and ready to use.`
            : activationFailed
            ? 'Your payment went through successfully. We\'re still setting up your subscription.'
            : 'Please wait while we activate your subscription...'
          }
        </DialogDescription>
      </DialogHeader>
      <SharedContent />
    </>
  );

  const DrawerSuccessContent = () => (
    <>
      <DrawerHeader>
        <DrawerTitle className="text-center">
          {activationComplete ? 'Subscription Activated!' : activationFailed ? 'Payment Successful!' : 'Processing Payment...'}
        </DrawerTitle>
        <DrawerDescription className="text-center">
          {activationComplete 
            ? `Welcome to ${planName}! Your subscription is now active and ready to use.`
            : activationFailed
            ? 'Your payment went through successfully. We\'re still setting up your subscription.'
            : 'Please wait while we activate your subscription...'
          }
        </DrawerDescription>
      </DrawerHeader>
      <div className="p-4">
        <SharedContent />
      </div>
    </>
  );

  return (
    <>
      {/* Success Modal/Drawer */}
      {showSuccessModal && (
        isMobile ? (
          <Drawer open={showSuccessModal} onOpenChange={setShowSuccessModal}>
            <DrawerContent>
              <DrawerSuccessContent />
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
            <DialogContent className="max-w-md">
              <DialogSuccessContent />
            </DialogContent>
          </Dialog>
        )
      )}
    </>
  );
}

