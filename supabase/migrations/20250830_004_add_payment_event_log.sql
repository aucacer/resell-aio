-- Migration 004: Payment Event Log
-- This migration creates a comprehensive payment event logging system
-- for tracking all Stripe webhook events and their processing status

-- Create payment_event_log table
CREATE TABLE public.payment_event_log (
  event_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Allow NULL for events without user context
  stripe_event_id TEXT NOT NULL UNIQUE, -- Stripe webhook event ID for deduplication
  event_type TEXT NOT NULL, -- Stripe event type (invoice.payment_succeeded, etc.)
  event_data JSONB NOT NULL DEFAULT '{}', -- Complete Stripe event payload
  processing_status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, failed, skipped
  processed_at TIMESTAMP WITH TIME ZONE, -- When event was successfully processed
  error_details JSONB, -- Store error information for failed processing
  retry_count INTEGER DEFAULT 0, -- Track retry attempts for failed events
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.payment_event_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only see their own events, system can see all
CREATE POLICY "Users can view their own payment events" 
ON public.payment_event_log 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow system/webhook functions to insert events (no user context required)
CREATE POLICY "System can insert payment events" 
ON public.payment_event_log 
FOR INSERT 
WITH CHECK (true);

-- Allow system/webhook functions to update events (no user context required)
CREATE POLICY "System can update payment events" 
ON public.payment_event_log 
FOR UPDATE 
USING (true);

-- Create required indexes for performance and event processing
CREATE INDEX idx_event_processing_status ON public.payment_event_log(processing_status);
CREATE INDEX idx_stripe_event_id_unique ON public.payment_event_log(stripe_event_id);
CREATE INDEX idx_event_type ON public.payment_event_log(event_type);
CREATE INDEX idx_user_events ON public.payment_event_log(user_id, created_at);
CREATE INDEX idx_failed_events ON public.payment_event_log(processing_status, retry_count) WHERE processing_status = 'failed';
CREATE INDEX idx_pending_events ON public.payment_event_log(created_at) WHERE processing_status = 'pending';

-- Update trigger for automatic timestamp updates
CREATE TRIGGER update_payment_event_log_updated_at
BEFORE UPDATE ON public.payment_event_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log payment events with deduplication
CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_stripe_event_id TEXT,
  p_event_type TEXT,
  p_event_data JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  event_uuid UUID;
  existing_event UUID;
BEGIN
  -- Check if event already exists (deduplication)
  SELECT event_id INTO existing_event 
  FROM public.payment_event_log 
  WHERE stripe_event_id = p_stripe_event_id;
  
  IF existing_event IS NOT NULL THEN
    -- Event already exists, return existing ID
    RETURN existing_event;
  END IF;
  
  -- Insert new event
  INSERT INTO public.payment_event_log (
    stripe_event_id,
    event_type,
    event_data,
    user_id,
    processing_status
  ) VALUES (
    p_stripe_event_id,
    p_event_type,
    p_event_data,
    p_user_id,
    'pending'
  ) RETURNING event_id INTO event_uuid;
  
  RETURN event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update event processing status
CREATE OR REPLACE FUNCTION public.update_event_processing_status(
  p_event_id UUID,
  p_status TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.payment_event_log
  SET 
    processing_status = p_status,
    processed_at = CASE WHEN p_status = 'processed' THEN now() ELSE processed_at END,
    error_details = CASE WHEN p_status = 'failed' THEN p_error_details ELSE error_details END,
    retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
    updated_at = now()
  WHERE event_id = p_event_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get events that need retry processing
CREATE OR REPLACE FUNCTION public.get_events_for_retry(
  max_retry_count INTEGER DEFAULT 3,
  retry_delay_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  event_id UUID,
  stripe_event_id TEXT,
  event_type TEXT,
  event_data JSONB,
  retry_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pel.event_id,
    pel.stripe_event_id,
    pel.event_type,
    pel.event_data,
    pel.retry_count
  FROM public.payment_event_log pel
  WHERE pel.processing_status = 'failed' 
    AND pel.retry_count < max_retry_count
    AND pel.updated_at < (now() - (retry_delay_minutes || ' minutes')::interval)
  ORDER BY pel.created_at ASC
  LIMIT 10; -- Process in batches
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;