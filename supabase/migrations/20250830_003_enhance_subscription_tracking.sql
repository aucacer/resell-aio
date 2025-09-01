-- Migration 003: Enhanced Subscription Tracking
-- This migration adds enhanced subscription status tracking capabilities
-- to improve synchronization with Stripe and provide better monitoring

-- Create subscription_enhanced_status table
CREATE TABLE public.subscription_enhanced_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT, -- Direct reference to Stripe subscription
  subscription_status TEXT NOT NULL DEFAULT 'active', -- Enhanced status tracking
  subscription_metadata JSONB DEFAULT '{}', -- Flexible storage for Stripe details
  last_sync_at TIMESTAMP WITH TIME ZONE, -- Track last sync with Stripe
  sync_status TEXT NOT NULL DEFAULT 'synced', -- Track sync health (synced, pending, failed, retry_needed)
  payment_method_status TEXT DEFAULT 'valid', -- Track payment method validity
  retry_count INTEGER DEFAULT 0, -- Count failed sync attempts
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id), -- One enhanced status record per user
  UNIQUE(stripe_subscription_id) -- Ensure no duplicate Stripe subscription tracking
);

-- Enable Row Level Security
ALTER TABLE public.subscription_enhanced_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies following existing patterns
CREATE POLICY "Users can view their own enhanced subscription status" 
ON public.subscription_enhanced_status 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own enhanced subscription status" 
ON public.subscription_enhanced_status 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own enhanced subscription status" 
ON public.subscription_enhanced_status 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create required indexes for performance
CREATE INDEX idx_stripe_subscription_id ON public.subscription_enhanced_status(stripe_subscription_id);
CREATE INDEX idx_sync_status ON public.subscription_enhanced_status(sync_status);
CREATE INDEX idx_user_subscription_status ON public.subscription_enhanced_status(user_id, subscription_status);

-- Update trigger for automatic timestamp updates
CREATE TRIGGER update_subscription_enhanced_status_updated_at
BEFORE UPDATE ON public.subscription_enhanced_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to sync enhanced status with main subscription table
CREATE OR REPLACE FUNCTION public.sync_enhanced_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When user_subscriptions is updated, also update enhanced status if it exists
  UPDATE public.subscription_enhanced_status
  SET 
    subscription_status = NEW.status,
    stripe_subscription_id = NEW.stripe_subscription_id,
    last_sync_at = now(),
    sync_status = 'synced',
    updated_at = now()
  WHERE user_id = NEW.user_id;
  
  -- If no enhanced status exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.subscription_enhanced_status (
      user_id,
      stripe_subscription_id,
      subscription_status,
      last_sync_at,
      sync_status
    ) VALUES (
      NEW.user_id,
      NEW.stripe_subscription_id,
      NEW.status,
      now(),
      'synced'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to keep enhanced status in sync with main subscription table
CREATE TRIGGER sync_enhanced_status_on_subscription_change
AFTER INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_enhanced_subscription_status();