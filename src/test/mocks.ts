import { vi } from 'vitest'

// Mock Supabase client
export const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    data: null,
    error: null,
  })),
  rpc: vi.fn(),
  raw: vi.fn((sql) => sql), // Mock the raw function
  auth: {
    getUser: vi.fn(),
    signOut: vi.fn(),
  },
}

// Mock Stripe webhook event
export const mockStripeWebhookEvent = {
  id: 'evt_test_webhook',
  object: 'event',
  api_version: '2020-08-27',
  created: 1677649604,
  data: {
    object: {
      id: 'sub_test',
      object: 'subscription',
      status: 'active',
      customer: 'cus_test',
    },
  },
  livemode: false,
  pending_webhooks: 0,
  request: {
    id: 'req_test',
    idempotency_key: null,
  },
  type: 'customer.subscription.updated',
}

// Mock Stripe signature verification
export const mockStripeSignature = 'v1=test_signature'

// Mock payment event log entry
export const mockPaymentEvent = {
  id: 'test-uuid',
  stripe_event_id: 'evt_test_webhook',
  event_type: 'customer.subscription.updated',
  event_data: mockStripeWebhookEvent.data,
  processing_status: 'pending',
  processed_at: null,
  error_details: null,
  retry_count: 0,
  created_at: new Date().toISOString(),
}

// Mock subscription status
export const mockSubscriptionStatus = {
  id: 'test-uuid',
  user_id: 'test-user-id',
  subscription_status: 'active',
  stripe_subscription_id: 'sub_test',
  subscription_metadata: {},
  last_sync_at: new Date().toISOString(),
  sync_status: 'synced',
  payment_method_status: 'valid',
  retry_count: 0,
}