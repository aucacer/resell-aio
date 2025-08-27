export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  max_inventory_items: number | null;
  stripe_price_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus = 
  | 'trialing' 
  | 'active' 
  | 'past_due' 
  | 'canceled' 
  | 'incomplete' 
  | 'incomplete_expired' 
  | 'unpaid';

export interface SubscriptionAccess {
  has_access: boolean;
  plan_id: string;
  status: SubscriptionStatus;
  trial_end: string | null;
  current_period_end: string | null;
  max_inventory_items: number | null;
}

export interface SubscriptionContextType {
  subscription: UserSubscription | null;
  subscriptionAccess: SubscriptionAccess | null;
  plans: SubscriptionPlan[];
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  hasAccess: boolean;
  isTrialing: boolean;
  daysUntilExpiry: number | null;
  inventoryLimit: number | null;
  canAddInventory: boolean;
}