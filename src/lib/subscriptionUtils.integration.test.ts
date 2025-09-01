import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  syncSubscriptionStatus, 
  getEnhancedSubscriptionStatus,
  updateEnhancedSubscriptionStatus,
  logPaymentEvent,
  getPaymentEventHistory 
} from './subscriptionUtils';

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        })),
        order: vi.fn(() => ({
          limit: vi.fn()
        }))
      })),
      upsert: vi.fn(),
      insert: vi.fn()
    }))
  }
}));

describe('subscriptionUtils Integration Tests', () => {
  const { supabase } = await vi.importMock('@/integrations/supabase/client') as { supabase: any };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncSubscriptionStatus', () => {
    it('should successfully sync subscription status', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: 'synchronized',
          userId: 'test-user-id',
          enhancedStatus: {
            user_id: 'test-user-id',
            subscription_status: 'active',
            sync_status: 'synced'
          }
        },
        error: null
      };

      supabase.functions.invoke.mockResolvedValueOnce(mockResponse);

      const result = await syncSubscriptionStatus('test-user-id');

      expect(result.success).toBe(true);
      expect(result.enhancedStatus).toBeDefined();
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'subscription-sync',
        { body: { userId: 'test-user-id' } }
      );
    });

    it('should handle sync errors gracefully', async () => {
      const mockError = new Error('Sync failed');
      supabase.functions.invoke.mockResolvedValueOnce({
        data: null,
        error: mockError
      });

      const result = await syncSubscriptionStatus('test-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe(mockError.message);
    });

    it('should handle network errors', async () => {
      supabase.functions.invoke.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await syncSubscriptionStatus('test-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getEnhancedSubscriptionStatus', () => {
    it('should fetch enhanced status successfully', async () => {
      const mockStatus = {
        user_id: 'test-user-id',
        subscription_status: 'active',
        sync_status: 'synced',
        last_sync_at: '2023-01-01T12:00:00Z'
      };

      const mockChain = {
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: mockStatus, error: null })
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      const result = await getEnhancedSubscriptionStatus('test-user-id');

      expect(result.success).toBe(true);
      expect(result.status).toEqual(mockStatus);
      expect(supabase.from).toHaveBeenCalledWith('subscription_enhanced_status');
    });

    it('should handle missing status gracefully', async () => {
      const mockChain = {
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ 
            data: null, 
            error: { code: 'PGRST116' } 
          })
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      const result = await getEnhancedSubscriptionStatus('test-user-id');

      expect(result.success).toBe(true);
      expect(result.status).toBeUndefined();
    });

    it('should handle database errors', async () => {
      const mockError = { message: 'Database error' };
      const mockChain = {
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: mockError })
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      const result = await getEnhancedSubscriptionStatus('test-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('updateEnhancedSubscriptionStatus', () => {
    it('should update status successfully', async () => {
      supabase.from.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValue({ error: null })
      });

      const updates = {
        subscription_status: 'active' as const,
        sync_status: 'synced' as const
      };

      const result = await updateEnhancedSubscriptionStatus('test-user-id', updates);

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('subscription_enhanced_status');
    });

    it('should handle update errors', async () => {
      const mockError = { message: 'Update failed' };
      mockSupabaseClient.from.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValue({ error: mockError })
      });

      const result = await updateEnhancedSubscriptionStatus('test-user-id', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed');
    });
  });

  describe('logPaymentEvent', () => {
    it('should log payment event successfully', async () => {
      supabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      const result = await logPaymentEvent(
        'test-user-id',
        'evt_test123',
        'invoice.payment_succeeded',
        { amount: 1000 },
        'processed'
      );

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('payment_event_log');
    });

    it('should handle logging errors', async () => {
      const mockError = { message: 'Insert failed' };
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: mockError })
      });

      const result = await logPaymentEvent(
        'test-user-id',
        'evt_test123',
        'invoice.payment_succeeded',
        { amount: 1000 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insert failed');
    });
  });

  describe('getPaymentEventHistory', () => {
    it('should fetch payment history successfully', async () => {
      const mockEvents = [
        {
          event_id: 'event1',
          stripe_event_id: 'evt_123',
          event_type: 'invoice.payment_succeeded',
          created_at: '2023-01-01T12:00:00Z'
        }
      ];

      const mockChain = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null })
          }))
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      const result = await getPaymentEventHistory('test-user-id');

      expect(result.success).toBe(true);
      expect(result.events).toEqual(mockEvents);
      expect(supabase.from).toHaveBeenCalledWith('payment_event_log');
    });

    it('should handle fetch errors', async () => {
      const mockError = { message: 'Fetch failed' };
      const mockChain = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: null, error: mockError })
          }))
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      const result = await getPaymentEventHistory('test-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fetch failed');
    });

    it('should use default limit when not specified', async () => {
      const mockChain = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null })
          }))
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      await getPaymentEventHistory('test-user-id');

      expect(mockChain.order().limit).toHaveBeenCalledWith(50);
    });

    it('should use custom limit when specified', async () => {
      const mockChain = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null })
          }))
        }))
      };

      supabase.from.mockReturnValueOnce({
        select: vi.fn(() => mockChain)
      });

      await getPaymentEventHistory('test-user-id', 100);

      expect(mockChain.order().limit).toHaveBeenCalledWith(100);
    });
  });
});