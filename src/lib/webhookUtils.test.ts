import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as webhookUtils from './webhookUtils'
import { mockSupabase, mockStripeWebhookEvent, mockPaymentEvent } from '../test/mocks'

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

describe('webhookUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock data
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    mockSupabase.rpc.mockResolvedValue({ data: 'test-event-id', error: null })
  })

  describe('logWebhookEvent', () => {
    it('should successfully log a webhook event', async () => {
      const stripeEventId = 'evt_test'
      const eventType = 'customer.subscription.updated'
      const eventData = { test: 'data' }
      const userId = 'user-123'

      const result = await webhookUtils.logWebhookEvent(stripeEventId, eventType, eventData, userId)

      expect(result.success).toBe(true)
      expect(result.eventId).toBe('test-event-id')
      expect(mockSupabase.rpc).toHaveBeenCalledWith('log_payment_event', {
        p_stripe_event_id: stripeEventId,
        p_event_type: eventType,
        p_event_data: eventData,
        p_user_id: userId,
      })
    })

    it('should handle RPC error when logging event', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

      const result = await webhookUtils.logWebhookEvent('evt_test', 'test.type', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('RPC failed')
      expect(result.processingStatus).toBe('failed')
    })

    it('should detect duplicate events', async () => {
      const stripeEventId = 'evt_duplicate'
      
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: { processing_status: 'processed' }, 
          error: null 
        }),
      })

      const result = await webhookUtils.logWebhookEvent(stripeEventId, 'test.type', {})

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(result.processingStatus).toBe('processed')
    })

    it('should handle exceptions gracefully', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network error'))

      const result = await webhookUtils.logWebhookEvent('evt_test', 'test.type', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(result.processingStatus).toBe('failed')
    })
  })

  describe('updateWebhookEventStatus', () => {
    it('should successfully update event status', async () => {
      const eventId = 'test-event-id'
      const status = 'processed'

      const result = await webhookUtils.updateWebhookEventStatus(eventId, status)

      expect(result).toBe(true)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_event_processing_status', {
        p_event_id: eventId,
        p_status: status,
        p_error_details: undefined,
      })
    })

    it('should handle error details when updating status', async () => {
      const eventId = 'test-event-id'
      const status = 'failed'
      const errorDetails = { error: 'Processing failed', code: 'PROC_001' }

      const result = await webhookUtils.updateWebhookEventStatus(eventId, status, errorDetails)

      expect(result).toBe(true)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_event_processing_status', {
        p_event_id: eventId,
        p_status: status,
        p_error_details: errorDetails,
      })
    })

    it('should return false on RPC error', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'Update failed' } })

      const result = await webhookUtils.updateWebhookEventStatus('test-id', 'failed')

      expect(result).toBe(false)
    })

    it('should handle exceptions', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network error'))

      const result = await webhookUtils.updateWebhookEventStatus('test-id', 'failed')

      expect(result).toBe(false)
    })
  })

  describe('getEventsForRetry', () => {
    it('should fetch events for retry with default parameters', async () => {
      const mockEvents = [mockPaymentEvent]
      mockSupabase.rpc.mockResolvedValue({ data: mockEvents, error: null })

      const result = await webhookUtils.getEventsForRetry()

      expect(result).toEqual(mockEvents)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_events_for_retry', {
        max_retry_count: 3,
        retry_delay_minutes: 5,
      })
    })

    it('should use custom retry parameters', async () => {
      const maxRetries = 5
      const delayMinutes = 10
      
      const result = await webhookUtils.getEventsForRetry(maxRetries, delayMinutes)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_events_for_retry', {
        max_retry_count: maxRetries,
        retry_delay_minutes: delayMinutes,
      })
    })

    it('should return empty array on RPC error', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

      const result = await webhookUtils.getEventsForRetry()

      expect(result).toEqual([])
    })

    it('should handle exceptions', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network error'))

      const result = await webhookUtils.getEventsForRetry()

      expect(result).toEqual([])
    })
  })

  describe('getWebhookEventStats', () => {
    it('should calculate stats correctly', async () => {
      const mockEvents = [
        { processing_status: 'processed', retry_count: 0 },
        { processing_status: 'processed', retry_count: 1 },
        { processing_status: 'failed', retry_count: 2 },
        { processing_status: 'pending', retry_count: 0 },
        { processing_status: 'skipped', retry_count: 0 },
      ]

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
      })

      const result = await webhookUtils.getWebhookEventStats()

      expect(result).toEqual({
        total: 5,
        pending: 1,
        processed: 2,
        failed: 1,
        skipped: 1,
        successRate: 60, // (2 processed + 1 skipped) / 5 * 100
        failureRate: 20, // 1 failed / 5 * 100
        avgRetryCount: 0.6, // (0+1+2+0+0) / 5
      })
    })

    it('should apply date filters', async () => {
      const fromDate = '2023-01-01'
      const toDate = '2023-12-31'
      
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery)

      await webhookUtils.getWebhookEventStats(fromDate, toDate)

      expect(mockQuery.gte).toHaveBeenCalledWith('created_at', fromDate)
      expect(mockQuery.lte).toHaveBeenCalledWith('created_at', toDate)
    })

    it('should return zero stats on database error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Database error' } 
        }),
      })

      const result = await webhookUtils.getWebhookEventStats()

      expect(result).toEqual({
        total: 0,
        pending: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
        successRate: 0,
        failureRate: 0,
        avgRetryCount: 0,
      })
    })
  })

  describe('getUserRecentWebhookEvents', () => {
    it('should fetch user events with default limit', async () => {
      const userId = 'user-123'
      const mockEvents = [mockPaymentEvent]
      
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery)

      const result = await webhookUtils.getUserRecentWebhookEvents(userId)

      expect(result).toEqual(mockEvents)
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
    })

    it('should use custom limit', async () => {
      const userId = 'user-123'
      const limit = 5
      
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery)

      await webhookUtils.getUserRecentWebhookEvents(userId, limit)

      expect(mockQuery.limit).toHaveBeenCalledWith(limit)
    })
  })

  describe('getWebhookEventsByType', () => {
    it('should fetch events by type', async () => {
      const eventType = 'customer.subscription.updated'
      const mockEvents = [mockPaymentEvent]
      
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      }
      
      mockSupabase.from.mockReturnValue(mockQuery)

      const result = await webhookUtils.getWebhookEventsByType(eventType)

      expect(result).toEqual(mockEvents)
      expect(mockQuery.eq).toHaveBeenCalledWith('event_type', eventType)
    })

    it('should apply optional filters', async () => {
      const eventType = 'test.event'
      const fromDate = '2023-01-01'
      const toDate = '2023-12-31'
      const limit = 5
      
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      }
      mockQuery.limit.mockResolvedValue({ data: [], error: null })
      
      mockSupabase.from.mockReturnValue(mockQuery)

      await webhookUtils.getWebhookEventsByType(eventType, fromDate, toDate, limit)

      expect(mockQuery.gte).toHaveBeenCalledWith('created_at', fromDate)
      expect(mockQuery.lte).toHaveBeenCalledWith('created_at', toDate)
      expect(mockQuery.limit).toHaveBeenCalledWith(limit)
    })
  })

  describe('validateWebhookSignature', () => {
    it('should return false for missing parameters', () => {
      expect(webhookUtils.validateWebhookSignature('', 'sig', 'secret')).toBe(false)
      expect(webhookUtils.validateWebhookSignature('payload', '', 'secret')).toBe(false)
      expect(webhookUtils.validateWebhookSignature('payload', 'sig', '')).toBe(false)
    })

    it('should return true for valid signature format', () => {
      const signature = 't=1640995200,v1=test_signature_hash'
      const result = webhookUtils.validateWebhookSignature('payload', signature, 'secret')
      
      expect(result).toBe(true)
    })

    it('should return false for invalid signature format', () => {
      const invalidSignature = 'invalid_signature_format'
      const result = webhookUtils.validateWebhookSignature('payload', invalidSignature, 'secret')
      
      expect(result).toBe(false)
    })

    it('should return false for signature missing timestamp', () => {
      const signature = 'v1=test_signature_hash'
      const result = webhookUtils.validateWebhookSignature('payload', signature, 'secret')
      
      expect(result).toBe(false)
    })

    it('should return false for signature missing hash', () => {
      const signature = 't=1640995200'
      const result = webhookUtils.validateWebhookSignature('payload', signature, 'secret')
      
      expect(result).toBe(false)
    })
  })

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(webhookUtils.calculateRetryDelay(0)).toBe(60000) // 1 minute in ms
      expect(webhookUtils.calculateRetryDelay(1)).toBe(120000) // 2 minutes in ms
      expect(webhookUtils.calculateRetryDelay(2)).toBe(240000) // 4 minutes in ms
      expect(webhookUtils.calculateRetryDelay(3)).toBe(480000) // 8 minutes in ms
    })

    it('should cap at 60 minutes', () => {
      expect(webhookUtils.calculateRetryDelay(10)).toBe(3600000) // 60 minutes in ms
      expect(webhookUtils.calculateRetryDelay(20)).toBe(3600000) // Still 60 minutes
    })
  })

  describe('isEventRetryable', () => {
    it('should return false if retry count exceeds max retries', () => {
      const lastAttempt = new Date().toISOString()
      
      expect(webhookUtils.isEventRetryable(lastAttempt, 3, 3)).toBe(false)
      expect(webhookUtils.isEventRetryable(lastAttempt, 5, 3)).toBe(false)
    })

    it('should return false if not enough time has passed', () => {
      const lastAttempt = new Date(Date.now() - 30000).toISOString() // 30 seconds ago
      
      expect(webhookUtils.isEventRetryable(lastAttempt, 0)).toBe(false)
    })

    it('should return true if enough time has passed', () => {
      const lastAttempt = new Date(Date.now() - 120000).toISOString() // 2 minutes ago
      
      expect(webhookUtils.isEventRetryable(lastAttempt, 0)).toBe(true)
    })

    it('should use default max retries', () => {
      const lastAttempt = new Date().toISOString()
      
      expect(webhookUtils.isEventRetryable(lastAttempt, 3)).toBe(false)
      expect(webhookUtils.isEventRetryable(lastAttempt, 2)).toBe(false)
    })
  })

  describe('extractUserIdFromWebhookEvent', () => {
    it('should extract user ID from object metadata', () => {
      const event = {
        data: {
          object: {
            metadata: {
              supabase_user_id: 'user-123'
            }
          }
        }
      }
      
      expect(webhookUtils.extractUserIdFromWebhookEvent(event)).toBe('user-123')
    })

    it('should extract user ID from subscription metadata', () => {
      const event = {
        data: {
          object: {
            subscription: {
              metadata: {
                supabase_user_id: 'user-456'
              }
            }
          }
        }
      }
      
      expect(webhookUtils.extractUserIdFromWebhookEvent(event)).toBe('user-456')
    })

    it('should extract user ID from checkout session', () => {
      const event = {
        data: {
          object: {
            type: 'checkout.session',
            metadata: {
              supabase_user_id: 'user-789'
            }
          }
        }
      }
      
      expect(webhookUtils.extractUserIdFromWebhookEvent(event)).toBe('user-789')
    })

    it('should return null if no user ID found', () => {
      const event = {
        data: {
          object: {
            id: 'test-object'
          }
        }
      }
      
      expect(webhookUtils.extractUserIdFromWebhookEvent(event)).toBeNull()
    })

    it('should handle event without data property', () => {
      const event = {
        metadata: {
          supabase_user_id: 'user-direct'
        }
      }
      
      expect(webhookUtils.extractUserIdFromWebhookEvent(event)).toBe('user-direct')
    })
  })

  describe('formatWebhookEventForLogging', () => {
    it('should sanitize payment method details', () => {
      const event = {
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
                email: 'john@example.com'
              }
            }
          }
        }
      }

      const sanitized = webhookUtils.formatWebhookEventForLogging(event)
      
      expect(sanitized.data.object.payment_method).toEqual({
        id: 'pm_123',
        type: 'card'
      })
    })

    it('should sanitize customer details', () => {
      const event = {
        data: {
          object: {
            customer: {
              id: 'cus_123',
              email: 'customer@example.com',
              name: 'Customer Name',
              phone: '+1234567890'
            }
          }
        }
      }

      const sanitized = webhookUtils.formatWebhookEventForLogging(event)
      
      expect(sanitized.data.object.customer).toEqual({
        id: 'cus_123'
      })
    })

    it('should preserve non-sensitive data', () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 2000,
            currency: 'usd',
            status: 'succeeded'
          }
        }
      }

      const sanitized = webhookUtils.formatWebhookEventForLogging(event)
      
      expect(sanitized.id).toBe('evt_123')
      expect(sanitized.type).toBe('payment_intent.succeeded')
      expect(sanitized.data.object.amount).toBe(2000)
      expect(sanitized.data.object.status).toBe('succeeded')
    })

    it('should handle events without sensitive data', () => {
      const event = {
        id: 'evt_123',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_123'
          }
        }
      }

      const sanitized = webhookUtils.formatWebhookEventForLogging(event)
      
      expect(sanitized).toEqual(event)
    })
  })
})