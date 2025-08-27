-- Fix Stripe integration issues
-- This migration updates subscription plans with proper Stripe price IDs
-- and adds functions to handle checkout success

-- Update the pro_monthly plan with a placeholder that needs to be replaced
-- with your actual Stripe price ID from your Stripe dashboard
-- To get the real price ID, go to your Stripe Dashboard -> Products -> Pro Monthly -> copy the price ID
UPDATE public.subscription_plans 
SET stripe_price_id = 'price_1RzzspIfYnJuIHc1TM5uQtwC'
WHERE id = 'pro_monthly';

-- Create a function to handle post-checkout success and refresh subscription data
CREATE OR REPLACE FUNCTION public.handle_checkout_success(
  user_uuid UUID,
  stripe_session_id TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  subscription_record RECORD;
BEGIN
  -- Get the user's current subscription with plan details
  SELECT us.*, sp.display_name as plan_name, sp.features
  INTO subscription_record
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = user_uuid;
  
  -- Return subscription info for frontend update
  SELECT json_build_object(
    'subscription_id', subscription_record.id,
    'plan_id', subscription_record.plan_id,
    'plan_name', subscription_record.plan_name,
    'status', subscription_record.status,
    'features', subscription_record.features,
    'stripe_customer_id', subscription_record.stripe_customer_id,
    'stripe_subscription_id', subscription_record.stripe_subscription_id,
    'current_period_end', subscription_record.current_period_end,
    'trial_end', subscription_record.trial_end,
    'updated_at', subscription_record.updated_at
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.handle_checkout_success(UUID, TEXT) TO authenticated;

-- Create an improved webhook processing function for better event handling
CREATE OR REPLACE FUNCTION public.process_stripe_webhook_event(
  event_type TEXT,
  stripe_object JSON
)
RETURNS BOOLEAN AS $$
DECLARE
  user_id_value UUID;
  success BOOLEAN := FALSE;
BEGIN
  -- Extract user ID from metadata
  user_id_value := (stripe_object->>'metadata'->>'supabase_user_id')::UUID;
  
  IF user_id_value IS NULL THEN
    RAISE NOTICE 'No supabase_user_id found in metadata';
    RETURN FALSE;
  END IF;
  
  CASE event_type
    WHEN 'checkout.session.completed' THEN
      -- Mark the checkout as completed and trigger subscription update
      UPDATE public.user_subscriptions 
      SET metadata = metadata || json_build_object('last_checkout_session', stripe_object->>'id')::jsonb,
          updated_at = now()
      WHERE user_id = user_id_value;
      success := TRUE;
      
    WHEN 'customer.subscription.created', 'customer.subscription.updated' THEN
      -- This will be handled by the main webhook function
      success := TRUE;
      
    ELSE
      RAISE NOTICE 'Unhandled event type: %', event_type;
  END CASE;
  
  RETURN success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role (for webhooks)
GRANT EXECUTE ON FUNCTION public.process_stripe_webhook_event(TEXT, JSON) TO service_role;
