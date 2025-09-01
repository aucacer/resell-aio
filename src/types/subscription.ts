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
  metadata: SubscriptionMetadata;
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

// Enhanced subscription status management types
export type SyncStatus = 
  | 'synced' 
  | 'pending' 
  | 'failed' 
  | 'retry_needed';

export type PaymentMethodStatus = 
  | 'valid' 
  | 'requires_action' 
  | 'expired' 
  | 'declined';

export interface EnhancedSubscriptionStatus {
  subscription_status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  subscription_metadata: SubscriptionMetadata;
  last_sync_at: string | null;
  sync_status: SyncStatus;
  payment_method_status: PaymentMethodStatus;
  retry_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Stripe event data interface
export interface StripeEventData {
  id?: string;
  object?: string;
  amount?: number;
  currency?: string;
  status?: string;
  invoice?: string;
  subscription?: string;
  customer?: string;
  [key: string]: unknown;
}

// Error details interface
export interface ErrorDetails {
  message?: string;
  code?: string;
  type?: string;
  stack?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// Subscription metadata interface
export interface SubscriptionMetadata {
  stripe_price_id?: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number;
  sync_source?: string;
  sync_timestamp?: string;
  last_error?: string;
  error_timestamp?: string;
  last_manual_sync?: string;
  [key: string]: unknown;
}

export interface PaymentEventLog {
  event_id: string;
  stripe_event_id: string;
  event_type: string;
  event_data: StripeEventData;
  processing_status: 'pending' | 'processed' | 'failed' | 'skipped';
  processed_at: string | null;
  error_details: ErrorDetails | null;
  retry_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

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
  error: string | null;
  refreshSubscription: () => Promise<void>;
  hasAccess: boolean;
  isTrialing: boolean;
  daysUntilExpiry: number | null;
  inventoryLimit: number | null;
  canAddInventory: boolean;
  initialLoadComplete: boolean;
}