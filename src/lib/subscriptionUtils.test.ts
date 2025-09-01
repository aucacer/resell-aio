import { describe, it, expect, vi } from 'vitest';
import {
  calculateBackoffDelay,
  isStatusCritical,
  getStatusDisplayText,
  getSyncStatusDisplay,
  needsSyncRetry,
  validateSubscriptionConsistency
} from './subscriptionUtils';
import type { SubscriptionStatus, SyncStatus, UserSubscription, EnhancedSubscriptionStatus } from '@/types/subscription';

describe('subscriptionUtils', () => {
  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateBackoffDelay(0)).toBe(1000);
      expect(calculateBackoffDelay(1)).toBe(2000);
      expect(calculateBackoffDelay(2)).toBe(4000);
      expect(calculateBackoffDelay(3)).toBe(8000);
    });

    it('should cap at maximum delay', () => {
      expect(calculateBackoffDelay(10)).toBe(10000); // Should be capped at maxDelayMs
    });
  });

  describe('isStatusCritical', () => {
    it('should identify critical statuses', () => {
      expect(isStatusCritical('past_due')).toBe(true);
      expect(isStatusCritical('canceled')).toBe(true);
      expect(isStatusCritical('incomplete')).toBe(true);
      expect(isStatusCritical('unpaid')).toBe(true);
    });

    it('should identify non-critical statuses', () => {
      expect(isStatusCritical('active')).toBe(false);
      expect(isStatusCritical('trialing')).toBe(false);
    });
  });

  describe('getStatusDisplayText', () => {
    it('should return correct display text for all statuses', () => {
      expect(getStatusDisplayText('active')).toBe('Active');
      expect(getStatusDisplayText('trialing')).toBe('Trial Period');
      expect(getStatusDisplayText('past_due')).toBe('Payment Overdue');
      expect(getStatusDisplayText('canceled')).toBe('Canceled');
    });
  });

  describe('getSyncStatusDisplay', () => {
    it('should return correct display info for sync statuses', () => {
      expect(getSyncStatusDisplay('synced')).toEqual({
        text: 'Synced',
        color: 'text-green-600'
      });
      expect(getSyncStatusDisplay('failed')).toEqual({
        text: 'Sync Failed',
        color: 'text-red-600'
      });
    });
  });

  describe('needsSyncRetry', () => {
    const mockDate = new Date('2023-01-01T12:00:00Z');
    
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return false for synced status', () => {
      expect(needsSyncRetry('synced', 0, null)).toBe(false);
    });

    it('should return false when max retries exceeded', () => {
      expect(needsSyncRetry('failed', 5, null)).toBe(false);
    });

    it('should return true when no last sync time', () => {
      expect(needsSyncRetry('failed', 1, null)).toBe(true);
    });

    it('should check time delay for retries', () => {
      const recentSync = new Date(mockDate.getTime() - 500).toISOString(); // 500ms ago
      const oldSync = new Date(mockDate.getTime() - 3000).toISOString(); // 3s ago
      
      expect(needsSyncRetry('failed', 1, recentSync)).toBe(false); // Too recent
      expect(needsSyncRetry('failed', 1, oldSync)).toBe(true); // Enough time passed
    });
  });

  describe('validateSubscriptionConsistency', () => {
    const mockUserSubscription: UserSubscription = {
      id: '1',
      user_id: 'user1',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      plan_id: 'basic',
      status: 'active',
      current_period_start: '2023-01-01',
      current_period_end: '2023-02-01',
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: {},
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    };

    const mockEnhancedStatus: EnhancedSubscriptionStatus = {
      subscription_status: 'active',
      stripe_subscription_id: 'sub_123',
      subscription_metadata: {},
      last_sync_at: '2023-01-01T12:00:00Z',
      sync_status: 'synced',
      payment_method_status: 'valid',
      retry_count: 0,
      user_id: 'user1',
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    };

    it('should return consistent when data matches', () => {
      const result = validateSubscriptionConsistency(mockUserSubscription, mockEnhancedStatus);
      expect(result.isConsistent).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect status mismatch', () => {
      const mismatchedStatus = { ...mockEnhancedStatus, subscription_status: 'canceled' as SubscriptionStatus };
      const result = validateSubscriptionConsistency(mockUserSubscription, mismatchedStatus);
      
      expect(result.isConsistent).toBe(false);
      expect(result.issues).toContain('Status mismatch: active vs canceled');
    });

    it('should detect Stripe ID mismatch', () => {
      const mismatchedStripeId = { ...mockEnhancedStatus, stripe_subscription_id: 'sub_different' };
      const result = validateSubscriptionConsistency(mockUserSubscription, mismatchedStripeId);
      
      expect(result.isConsistent).toBe(false);
      expect(result.issues).toContain('Stripe ID mismatch: sub_123 vs sub_different');
    });

    it('should detect missing enhanced status', () => {
      const result = validateSubscriptionConsistency(mockUserSubscription, null);
      
      expect(result.isConsistent).toBe(false);
      expect(result.issues).toContain('Enhanced status missing for existing subscription');
    });

    it('should be consistent when both are null', () => {
      const result = validateSubscriptionConsistency(null, null);
      
      expect(result.isConsistent).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});