-- Enhanced Subscription Status Management Migration
-- Story 1.3: Implement Subscription Status Management

-- Create enhanced subscription status table
CREATE TABLE IF NOT EXISTS public.subscription_enhanced_status (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    subscription_metadata JSONB DEFAULT '{}',
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed', 'retry_needed')),
    payment_method_status TEXT NOT NULL DEFAULT 'valid' CHECK (payment_method_status IN ('valid', 'requires_action', 'expired', 'declined')),
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payment event log table for audit trail
CREATE TABLE IF NOT EXISTS public.payment_event_log (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed', 'skipped')),
    processed_at TIMESTAMPTZ,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_subscription_enhanced_status_stripe_id ON public.subscription_enhanced_status(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_enhanced_status_sync_status ON public.subscription_enhanced_status(sync_status);
CREATE INDEX IF NOT EXISTS idx_subscription_enhanced_status_user_id ON public.subscription_enhanced_status(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_event_log_stripe_event_id ON public.payment_event_log(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_event_log_processing_status ON public.payment_event_log(processing_status);
CREATE INDEX IF NOT EXISTS idx_payment_event_log_user_id ON public.payment_event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_event_log_created_at ON public.payment_event_log(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.subscription_enhanced_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_event_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_enhanced_status
DROP POLICY IF EXISTS "Users can view their own enhanced subscription status" ON public.subscription_enhanced_status;
CREATE POLICY "Users can view their own enhanced subscription status"
    ON public.subscription_enhanced_status FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own enhanced subscription status" ON public.subscription_enhanced_status;
CREATE POLICY "Users can update their own enhanced subscription status"
    ON public.subscription_enhanced_status FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all enhanced subscription status" ON public.subscription_enhanced_status;
CREATE POLICY "Service role can manage all enhanced subscription status"
    ON public.subscription_enhanced_status FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for payment_event_log
DROP POLICY IF EXISTS "Users can view their own payment events" ON public.payment_event_log;
CREATE POLICY "Users can view their own payment events"
    ON public.payment_event_log FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Service role can manage all payment events" ON public.payment_event_log;
CREATE POLICY "Service role can manage all payment events"
    ON public.payment_event_log FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to log payment events with deduplication
CREATE OR REPLACE FUNCTION public.log_payment_event(
    p_stripe_event_id TEXT,
    p_event_type TEXT,
    p_event_data JSONB,
    p_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
    v_existing_event_id UUID;
BEGIN
    -- Check if event already exists (deduplication)
    SELECT event_id INTO v_existing_event_id
    FROM public.payment_event_log
    WHERE stripe_event_id = p_stripe_event_id;
    
    IF v_existing_event_id IS NOT NULL THEN
        -- Update existing event
        UPDATE public.payment_event_log
        SET 
            event_data = p_event_data,
            updated_at = NOW(),
            user_id = COALESCE(p_user_id, user_id)
        WHERE event_id = v_existing_event_id;
        
        RETURN v_existing_event_id;
    ELSE
        -- Create new event
        INSERT INTO public.payment_event_log (
            stripe_event_id,
            event_type,
            event_data,
            user_id,
            created_at,
            updated_at
        ) VALUES (
            p_stripe_event_id,
            p_event_type,
            p_event_data,
            p_user_id,
            NOW(),
            NOW()
        ) RETURNING event_id INTO v_event_id;
        
        RETURN v_event_id;
    END IF;
END;
$$;

-- Function to update payment event processing status
CREATE OR REPLACE FUNCTION public.update_event_processing_status(
    p_event_id UUID,
    p_status TEXT,
    p_error_details JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.payment_event_log
    SET 
        processing_status = p_status,
        processed_at = CASE WHEN p_status = 'processed' THEN NOW() ELSE processed_at END,
        error_details = COALESCE(p_error_details, error_details),
        retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
        updated_at = NOW()
    WHERE event_id = p_event_id;
    
    RETURN FOUND;
END;
$$;

-- Function to get subscription sync health metrics
CREATE OR REPLACE FUNCTION public.get_subscription_sync_metrics()
RETURNS TABLE (
    total_subscriptions BIGINT,
    synced_count BIGINT,
    pending_count BIGINT,
    failed_count BIGINT,
    retry_needed_count BIGINT,
    health_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_subscriptions,
        COUNT(*) FILTER (WHERE sync_status = 'synced') as synced_count,
        COUNT(*) FILTER (WHERE sync_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE sync_status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE sync_status = 'retry_needed') as retry_needed_count,
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(*) FILTER (WHERE sync_status = 'synced')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        END as health_percentage
    FROM public.subscription_enhanced_status;
END;
$$;

-- Function to clean up old payment event logs (keep last 6 months)
CREATE OR REPLACE FUNCTION public.cleanup_old_payment_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.payment_event_log
    WHERE created_at < NOW() - INTERVAL '6 months'
    AND processing_status IN ('processed', 'skipped');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_timestamp_subscription_enhanced_status ON public.subscription_enhanced_status;
CREATE TRIGGER set_timestamp_subscription_enhanced_status
    BEFORE UPDATE ON public.subscription_enhanced_status
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_payment_event_log ON public.payment_event_log;
CREATE TRIGGER set_timestamp_payment_event_log
    BEFORE UPDATE ON public.payment_event_log
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_enhanced_status TO authenticated;
GRANT SELECT ON public.payment_event_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_payment_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_event_processing_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_sync_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_payment_events TO authenticated;

-- Comment on tables and functions for documentation
COMMENT ON TABLE public.subscription_enhanced_status IS 'Enhanced subscription status tracking with sync monitoring';
COMMENT ON TABLE public.payment_event_log IS 'Audit log for all subscription and payment events from Stripe webhooks';

COMMENT ON FUNCTION public.log_payment_event IS 'Log payment events with automatic deduplication based on Stripe event ID';
COMMENT ON FUNCTION public.update_event_processing_status IS 'Update processing status of payment events with retry tracking';
COMMENT ON FUNCTION public.get_subscription_sync_metrics IS 'Get aggregated health metrics for subscription sync monitoring';
COMMENT ON FUNCTION public.cleanup_old_payment_events IS 'Clean up processed payment event logs older than 6 months';

-- Insert initial data for existing users if needed
-- This ensures existing users get an enhanced status record
INSERT INTO public.subscription_enhanced_status (user_id, subscription_status, sync_status)
SELECT DISTINCT us.user_id, us.status, 'synced'
FROM public.user_subscriptions us
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscription_enhanced_status ses 
    WHERE ses.user_id = us.user_id
)
ON CONFLICT (user_id) DO NOTHING;