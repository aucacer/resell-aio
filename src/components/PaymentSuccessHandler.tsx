import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function PaymentSuccessHandler() {
  const { user } = useAuth();
  const { refreshSubscription } = useSubscriptionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [hasShownSuccess, setHasShownSuccess] = useState(false);

  useEffect(() => {
    console.log('🔄 PaymentSuccessHandler useEffect triggered');
    const handlePaymentSuccess = async () => {
      const success = searchParams.get('success');
      const sessionId = searchParams.get('session_id');
      
      console.log('🎉 PaymentSuccessHandler - URL params:', { success, sessionId, user: !!user, hasShownSuccess });
      console.log('🔍 Current URL:', window.location.href);
      
      // Also show success if we just have the success parameter (in case session_id gets lost)
      if (success === 'true' && user && !hasShownSuccess) {
        console.log('✅ Payment success detected, processing...');
        setHasShownSuccess(true);
        
        try {
          // Try calling the RPC function first
          console.log('🔄 Attempting RPC call to handle_checkout_success...');
          const { data, error } = await supabase
            .rpc('handle_checkout_success', { 
              user_uuid: user.id,
              stripe_session_id: sessionId 
            });
          
          if (error) {
            console.log('❌ RPC call failed, continuing with direct refresh:', error);
          } else {
            console.log('✅ Checkout success handled:', data);
          }
          
        } catch (error: any) {
          console.log('❌ Error calling RPC function, continuing:', error);
        }
        
        // Always refresh subscription data (main fix for the issue)
        console.log('🔄 Refreshing subscription data...');
        
        // Retry mechanism - sometimes webhooks take a moment
        let retries = 3;
        let subscriptionUpdated = false;
        
        for (let i = 0; i < retries; i++) {
          console.log(`🔄 Retry attempt ${i + 1}/${retries} - refreshing subscription...`);
          await refreshSubscription();
          
          // Check if subscription was updated by fetching it directly
          console.log('📊 Checking subscription status in database...');
          const { data: subscription } = await supabase
            .from('user_subscriptions')
            .select('plan_id, status')
            .eq('user_id', user.id)
            .single();
          
          console.log('💳 Current subscription data:', subscription);
            
          if (subscription?.plan_id === 'pro_monthly' && subscription?.status === 'active') {
            subscriptionUpdated = true;
            console.log('✅ Subscription successfully updated to pro_monthly');
            break;
          }
          
          if (i < retries - 1) {
            console.log(`⏳ Subscription not yet updated, retrying in ${(i + 1) * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
          } else {
            console.log('❌ All retry attempts exhausted, subscription may not be updated yet');
          }
        }
        
        // Show success message
        console.log('🎊 Showing success toast message...');
        toast({
          title: "Payment Successful! 🎉",
          description: subscriptionUpdated 
            ? "Your subscription has been activated. Welcome to Pro!"
            : "Your payment was processed successfully. Your subscription will be activated shortly.",
          duration: 8000, // Show for 8 seconds instead of default
        });
        
        // Clean up URL parameters
        console.log('🧹 Cleaning up URL parameters...');
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('success');
        newSearchParams.delete('session_id');
        setSearchParams(newSearchParams, { replace: true });
        
        console.log('✅ Payment success handling completed!');
      }
    };
    
    handlePaymentSuccess();
  }, [searchParams, user, refreshSubscription, toast, setSearchParams]);

  return null; // This component doesn't render anything
}

