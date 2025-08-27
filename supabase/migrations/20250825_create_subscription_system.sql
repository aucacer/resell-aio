-- Create subscription plans lookup table
CREATE TABLE public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL DEFAULT 'month', -- month, year
  features JSONB DEFAULT '[]',
  max_inventory_items INTEGER,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default plans
INSERT INTO public.subscription_plans (id, name, display_name, description, price, max_inventory_items, features, stripe_price_id) VALUES
  ('free_trial', 'Free Trial', 'Free Trial', 'Perfect for trying out ResellAIO', 0.00, 50, 
   '["Up to 50 inventory items", "Basic analytics dashboard", "Sales tracking (3 platforms)", "Expense tracking", "CSV export", "Email support"]', 
   null),
  ('pro_monthly', 'Pro Plan', 'Pro Monthly', 'Best for serious resellers', 29.00, null,
   '["Unlimited inventory items", "Advanced analytics & reports", "All platform integrations", "Multi-currency support", "Automated expense tracking", "Priority support", "Data backup & export", "Mobile app access"]',
   'price_1ProMonthlyStripeId'),
  ('enterprise', 'Enterprise', 'Enterprise', 'For large operations & teams', 0.00, null,
   '["Everything in Pro", "Custom integrations", "Team collaboration tools", "Advanced API access", "Dedicated account manager", "Custom training", "SLA guarantee", "White-label options"]',
   null);

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing', -- trialing, active, past_due, canceled, incomplete, incomplete_expired, unpaid
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans (readable by all authenticated users)
CREATE POLICY "Anyone can read subscription plans" 
ON public.subscription_plans 
FOR SELECT 
TO authenticated
USING (is_active = TRUE);

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscription" 
ON public.user_subscriptions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscription" 
ON public.user_subscriptions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription" 
ON public.user_subscriptions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to automatically create free trial on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_id, 
    status, 
    trial_start, 
    trial_end,
    current_period_start,
    current_period_end
  )
  VALUES (
    NEW.id, 
    'free_trial', 
    'trialing',
    now(),
    now() + interval '30 days',
    now(),
    now() + interval '30 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create subscription on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Create function to check subscription status
CREATE OR REPLACE FUNCTION public.check_subscription_access(user_uuid UUID)
RETURNS TABLE (
  has_access BOOLEAN,
  plan_id TEXT,
  status TEXT,
  trial_end TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  max_inventory_items INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN us.status IN ('active', 'trialing') AND 
           (us.current_period_end IS NULL OR us.current_period_end > now()) 
      THEN TRUE 
      ELSE FALSE 
    END as has_access,
    us.plan_id,
    us.status,
    us.trial_end,
    us.current_period_end,
    sp.max_inventory_items
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's current inventory count
CREATE OR REPLACE FUNCTION public.get_user_inventory_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  item_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO item_count
  FROM public.inventory
  WHERE user_id = user_uuid AND (is_sold = FALSE OR is_sold IS NULL);
  
  RETURN COALESCE(item_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer_id ON public.user_subscriptions(stripe_customer_id);
CREATE INDEX idx_user_subscriptions_stripe_subscription_id ON public.user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX idx_subscription_plans_active ON public.subscription_plans(is_active);

-- Update trigger for automatic timestamp updates
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();