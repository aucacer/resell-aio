import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockSupabase, mockStripeWebhookEvent } from '../mocks'
import * as webhookUtils from '../../lib/webhookUtils'
import * as subscriptionUtils from '../../lib/subscriptionUtils'

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

describe('Webhook Processing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default successful mock responses
    mockSupabase.rpc.mockResolvedValue({ data: 'test-event-id', error: null })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    })
  })

  describe('Complete Webhook to Database Flow', () => {
    it('should successfully process new webhook event end-to-end', async () => {
      const stripeEventId = 'evt_new_subscription'
      const eventType = 'customer.subscription.created'
      const eventData = {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          status: 'active',
          metadata: {
            supabase_user_id: 'user-123'
          }
        }
      }

      // Step 1: Log the webhook event
      const logResult = await webhookUtils.logWebhookEvent(
        stripeEventId,
        eventType,
        eventData,
        'user-123'
      )

      expect(logResult.success).toBe(true)
      expect(logResult.eventId).toBe('test-event-id')
      expect(mockSupabase.rpc).toHaveBeenCalledWith('log_payment_event', {
        p_stripe_event_id: stripeEventId,
        p_event_type: eventType,
        p_event_data: eventData,
        p_user_id: 'user-123',
      })

      // Step 2: Update processing status
      const updateResult = await webhookUtils.updateWebhookEventStatus(
        'test-event-id',
        'processed'
      )

      expect(updateResult).toBe(true)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_event_processing_status', {
        p_event_id: 'test-event-id',
        p_status: 'processed',
        p_error_details: undefined,
      })

      // Verify total RPC calls
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2)
    })

    it('should handle webhook deduplication correctly', async () => {
      const stripeEventId = 'evt_duplicate'
      
      // Mock existing processed event
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: { processing_status: 'processed' }, 
          error: null 
        }),
      })

      const result = await webhookUtils.logWebhookEvent(
        stripeEventId,
        'customer.subscription.updated',
        {}
      )

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(result.processingStatus).toBe('processed')
    })

    it('should handle webhook processing failure with retry logic', async () => {
      const eventId = 'test-event-id'
      const errorDetails = {
        message: 'Processing failed',
        code: 'PROC_FAIL',
        timestamp: new Date().toISOString()
      }

      // Simulate processing failure
      const result = await webhookUtils.updateWebhookEventStatus(
        eventId,
        'failed',
        errorDetails
      )

      expect(result).toBe(true)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_event_processing_status', {
        p_event_id: eventId,
        p_status: 'failed',
        p_error_details: errorDetails,
      })

      // Verify event can be retrieved for retry
      const retryEvents = await webhookUtils.getEventsForRetry(3, 5)
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_events_for_retry', {
        max_retry_count: 3,
        retry_delay_minutes: 5,
      })
    })

    it('should integrate with subscription status updates', async () => {
      const userId = 'user-123'
      const subscriptionData = {
        id: 'sub_test',
        status: 'active',
        metadata: { supabase_user_id: userId }
      }

      // Step 1: Log subscription webhook event
      await webhookUtils.logWebhookEvent(
        'evt_sub_update',
        'customer.subscription.updated',
        { object: subscriptionData },
        userId
      )

      // Step 2: Update subscription sync status
      const syncResult = await subscriptionUtils.markSubscriptionSynced(userId, {
        stripe_subscription_id: subscriptionData.id,
        webhook_processed: true
      })

      expect(syncResult.success).toBe(true)
      expect(syncResult.syncStatus).toBe('synced')

      // Verify both utilities were called
      expect(mockSupabase.rpc).toHaveBeenCalledWith('log_payment_event', expect.any(Object))
      expect(mockSupabase.from).toHaveBeenCalledWith('subscription_enhanced_status')
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should handle database connection failures gracefully', async () => {
      // Simulate database connection error
      mockSupabase.rpc.mockRejectedValue(new Error('Database connection failed'))

      const result = await webhookUtils.logWebhookEvent(
        'evt_db_fail',
        'test.event',
        {}
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database connection failed')
      expect(result.processingStatus).toBe('failed')
    })

    it('should handle partial failures in event processing', async () => {
      // Simulate successful logging but failed status update
      const eventId = 'test-event-id'
      
      // First call (logging) succeeds
      mockSupabase.rpc.mockResolvedValueOnce({ data: eventId, error: null })
      // Second call (status update) fails  
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } })

      // Log event successfully
      const logResult = await webhookUtils.logWebhookEvent('evt_partial', 'test.event', {})
      expect(logResult.success).toBe(true)

      // Status update fails
      const updateResult = await webhookUtils.updateWebhookEventStatus(eventId, 'processed')
      expect(updateResult).toBe(false)
    })

    it('should validate retry delay calculations', async () => {
      // Test exponential backoff calculations
      expect(webhookUtils.calculateRetryDelay(0)).toBe(60000) // 1 minute
      expect(webhookUtils.calculateRetryDelay(1)).toBe(120000) // 2 minutes
      expect(webhookUtils.calculateRetryDelay(2)).toBe(240000) // 4 minutes
      expect(webhookUtils.calculateRetryDelay(10)).toBe(3600000) // Capped at 60 minutes

      // Test retry window validation
      const now = Date.now()
      const oldAttempt = new Date(now - 5 * 60 * 1000).toISOString() // 5 minutes ago
      const recentAttempt = new Date(now - 30 * 1000).toISOString() // 30 seconds ago

      expect(webhookUtils.isEventRetryable(oldAttempt, 0)).toBe(true) // Enough time passed
      expect(webhookUtils.isEventRetryable(recentAttempt, 0)).toBe(false) // Too recent
      expect(webhookUtils.isEventRetryable(oldAttempt, 5, 3)).toBe(false) // Exceeded max retries
    })
  })

  describe('Data Integrity Validation', () => {
    it('should ensure webhook events are properly sanitized', async () => {
      const sensitiveEvent = {
        data: {
          object: {
            id: 'payment_intent_123',
            payment_method: {
              id: 'pm_123',
              type: 'card',
              card: {
                brand: 'visa',
                last4: '4242',
                exp_month: 12,
                exp_year: 2024
              },
              billing_details: {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '+1234567890'
              }
            },
            customer: {
              id: 'cus_123',
              email: 'customer@example.com',
              name: 'Customer Name'
            }
          }
        }
      }

      const sanitized = webhookUtils.formatWebhookEventForLogging(sensitiveEvent)

      // Verify sensitive data is removed
      expect(sanitized.data.object.payment_method).toEqual({
        id: 'pm_123',
        type: 'card'
      })
      
      expect(sanitized.data.object.customer).toEqual({
        id: 'cus_123'
      })

      // Verify non-sensitive data is preserved
      expect(sanitized.data.object.id).toBe('payment_intent_123')
    })

    it('should correctly extract user IDs from various event types', async () => {
      // Test direct object metadata
      const event1 = {
        data: {
          object: {
            metadata: { supabase_user_id: 'user-direct' }
          }
        }
      }
      expect(webhookUtils.extractUserIdFromWebhookEvent(event1)).toBe('user-direct')

      // Test subscription metadata
      const event2 = {
        data: {
          object: {
            subscription: {
              metadata: { supabase_user_id: 'user-subscription' }
            }
          }
        }
      }
      expect(webhookUtils.extractUserIdFromWebhookEvent(event2)).toBe('user-subscription')

      // Test checkout session
      const event3 = {
        data: {
          object: {
            type: 'checkout.session',
            metadata: { supabase_user_id: 'user-checkout' }
          }
        }
      }
      expect(webhookUtils.extractUserIdFromWebhookEvent(event3)).toBe('user-checkout')

      // Test no user ID found
      const event4 = { data: { object: { id: 'test' } } }
      expect(webhookUtils.extractUserIdFromWebhookEvent(event4)).toBeNull()
    })
  })

  describe('Performance and Monitoring', () => {
    it('should generate accurate processing statistics', async () => {
      const mockStats = [
        { processing_status: 'processed', retry_count: 0 },
        { processing_status: 'processed', retry_count: 1 },
        { processing_status: 'failed', retry_count: 2 },
        { processing_status: 'pending', retry_count: 0 },
        { processing_status: 'skipped', retry_count: 0 },
      ]

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockStats, error: null }),
      })

      const stats = await webhookUtils.getWebhookEventStats()

      expect(stats.total).toBe(5)
      expect(stats.processed).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.pending).toBe(1)
      expect(stats.skipped).toBe(1)
      expect(stats.successRate).toBe(60) // (2 processed + 1 skipped) / 5 * 100
      expect(stats.failureRate).toBe(20) // 1 failed / 5 * 100
      expect(stats.avgRetryCount).toBe(0.6) // (0+1+2+0+0) / 5
    })

    it('should handle batch event processing scenarios', async () => {
      const batchEvents = [
        { stripeEventId: 'evt_1', eventType: 'subscription.created' },
        { stripeEventId: 'evt_2', eventType: 'subscription.updated' },
        { stripeEventId: 'evt_3', eventType: 'invoice.paid' },
      ]

      // Process multiple events
      const results = await Promise.all(
        batchEvents.map(event => 
          webhookUtils.logWebhookEvent(event.stripeEventId, event.eventType, {})
        )
      )

      // Verify all events were processed
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      // Verify RPC was called for each event
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(3)
    })
  })

  describe('Integration with Subscription Management', () => {
    it('should coordinate webhook processing with subscription sync', async () => {
      const userId = 'user-123'
      const stripeSubscriptionId = 'sub_test'
      
      // Mock subscription status
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'subscription-record-id',
            user_id: userId,
            stripe_subscription_id: stripeSubscriptionId,
            sync_status: 'pending',
            retry_count: 0
          },
          error: null
        }),
        update: vi.fn().mockReturnThis(),
      })

      // Process webhook
      await webhookUtils.logWebhookEvent(
        'evt_subscription_change',
        'customer.subscription.updated',
        {
          object: {
            id: stripeSubscriptionId,
            status: 'active',
            metadata: { supabase_user_id: userId }
          }
        },
        userId
      )

      // Update subscription sync status
      const syncResult = await subscriptionUtils.markSubscriptionSynced(userId)

      expect(syncResult.success).toBe(true)
      expect(syncResult.syncStatus).toBe('synced')

      // Mock the health check to return true for synced status with recent sync
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            sync_status: 'synced',
            last_sync_at: new Date().toISOString(),
            retry_count: 0
          },
          error: null
        }),
      })

      // Check subscription health
      const healthCheck = await subscriptionUtils.isSubscriptionSyncHealthy(userId)
      expect(healthCheck).toBe(true)
    })
  })
})