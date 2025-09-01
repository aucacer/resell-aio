// TypeScript types for webhook event processing and logging

export interface StripeWebhookEvent {
  id: string
  object: 'event'
  api_version: string
  created: number
  data: {
    object: Record<string, unknown>
    previous_attributes?: Record<string, unknown>
  }
  livemode: boolean
  pending_webhooks: number
  request: {
    id: string
    idempotency_key: string
  }
  type: string
}

export interface PaymentEventLog {
  event_id: string
  user_id: string | null
  stripe_event_id: string
  event_type: string
  event_data: Record<string, unknown>
  processing_status: ProcessingStatus
  processed_at: string | null
  error_details: Record<string, unknown> | null
  retry_count: number
  created_at: string
  updated_at: string
}

export type ProcessingStatus = 'pending' | 'processed' | 'failed' | 'skipped'

export interface SubscriptionEnhancedStatus {
  id: string
  user_id: string
  stripe_subscription_id: string | null
  subscription_status: string
  subscription_metadata: Record<string, unknown>
  last_sync_at: string | null
  sync_status: SyncStatus
  payment_method_status: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'retry_needed'

export interface WebhookProcessingResult {
  success: boolean
  eventId: string
  logEventId: string | null
  status: ProcessingStatus
  error?: string
  retryable?: boolean
}

export interface WebhookRetryInfo {
  shouldRetry: boolean
  retryAfter: number // milliseconds
  maxRetriesReached: boolean
  nextRetryAt: Date
}

export interface WebhookEventStats {
  total: number
  pending: number
  processed: number
  failed: number
  skipped: number
  successRate: number
  failureRate: number
  avgRetryCount: number
  recentFailures: number
  oldestUnprocessed?: string
}

export interface SubscriptionSyncMetrics {
  total: number
  synced: number
  pending: number
  failed: number
  retryNeeded: number
  healthyPercentage: number
  lastSyncTime?: string
  oldestFailedSync?: string
}

// Stripe-specific event types that we handle
export type StripeEventType = 
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'

// Error types for webhook processing
export interface WebhookError {
  type: 'signature_verification' | 'processing' | 'database' | 'stripe_api' | 'network'
  message: string
  code?: string
  details?: Record<string, unknown>
  retryable: boolean
  retryAfter?: number
}

// Configuration for webhook processing
export interface WebhookConfig {
  maxRetries: number
  retryDelayMinutes: number
  timeoutSeconds: number
  enableDeduplication: boolean
  enableEventLogging: boolean
  logSensitiveData: boolean
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  maxRetries: 3,
  retryDelayMinutes: 5,
  timeoutSeconds: 30,
  enableDeduplication: true,
  enableEventLogging: true,
  logSensitiveData: false
}

// Event data structures for different Stripe events
export interface CheckoutSessionData {
  id: string
  object: 'checkout.session'
  mode: 'payment' | 'setup' | 'subscription'
  status: 'open' | 'complete' | 'expired'
  customer: string
  subscription: string | null
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  metadata: Record<string, string>
  success_url: string
  cancel_url: string
}

export interface SubscriptionData {
  id: string
  object: 'subscription'
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  customer: string
  current_period_start: number
  current_period_end: number
  trial_start: number | null
  trial_end: number | null
  cancel_at_period_end: boolean
  canceled_at: number | null
  metadata: Record<string, string>
  items: {
    data: Array<{
      id: string
      price: {
        id: string
        nickname: string | null
        unit_amount: number
        currency: string
      }
    }>
  }
}

export interface InvoiceData {
  id: string
  object: 'invoice'
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  customer: string
  subscription: string | null
  amount_paid: number
  amount_due: number
  currency: string
  payment_intent: string | null
  metadata: Record<string, string>
}

// Database function call types
export interface LogPaymentEventParams {
  p_stripe_event_id: string
  p_event_type: string
  p_event_data: Record<string, unknown>
  p_user_id?: string
}

export interface UpdateEventStatusParams {
  p_event_id: string
  p_status: ProcessingStatus
  p_error_details?: Record<string, unknown>
}

export interface GetEventsForRetryParams {
  max_retry_count?: number
  retry_delay_minutes?: number
}

// Response types for database functions
export interface LogPaymentEventResponse {
  event_id: string
  is_duplicate: boolean
}

export interface UpdateEventStatusResponse {
  success: boolean
  updated_at: string
}

export interface GetEventsForRetryResponse {
  events: Array<{
    event_id: string
    stripe_event_id: string
    event_type: string
    event_data: Record<string, unknown>
    retry_count: number
  }>
}