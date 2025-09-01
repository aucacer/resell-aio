import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCheckoutErrorMessage,
  getPortalErrorMessage,
  validatePaymentRequirements,
  formatErrorForLogging,
  STRIPE_ERROR_CODES,
  showPaymentErrorToast
} from './paymentErrorUtils';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn()
  }
}));

describe('paymentErrorUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCheckoutErrorMessage', () => {
    it('handles timeout errors', () => {
      const error = new Error('Request timed out');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Connection Timeout');
      expect(result.message).toContain('taking too long');
      expect(result.duration).toBe(10000);
    });

    it('handles unauthorized errors', () => {
      const error = new Error('Unauthorized access');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Session Expired');
      expect(result.message).toContain('session has expired');
    });

    it('handles network errors', () => {
      const error = new Error('Failed to fetch');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Network Error');
      expect(result.message).toContain('Unable to connect');
    });

    it('handles rate limiting', () => {
      const error = new Error('429 Too Many Requests');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Too Many Requests');
      expect(result.message).toContain('wait a moment');
    });

    it('handles server errors', () => {
      const error = new Error('500 Internal Server Error');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Server Error');
      expect(result.message).toContain('servers are experiencing issues');
    });

    it('handles missing required field errors', () => {
      const error = new Error('Missing required field: price_id');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Configuration Error');
      expect(result.message).toContain('configuration issue');
    });

    it('handles price not found errors', () => {
      const error = new Error('No such price: price_invalid');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Plan Unavailable');
      expect(result.message).toContain('no longer available');
    });

    it('handles generic errors', () => {
      const error = new Error('Some unknown error');
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Checkout Error');
      expect(result.message).toContain('Some unknown error');
    });

    it('handles errors without messages', () => {
      const error = {};
      const result = getCheckoutErrorMessage(error);
      
      expect(result.title).toBe('Checkout Error');
      expect(result.message).toContain('Failed to create checkout session');
    });
  });

  describe('getPortalErrorMessage', () => {
    it('handles portal not enabled errors', () => {
      const error = new Error('Customer portal is not enabled');
      const result = getPortalErrorMessage(error);
      
      expect(result.title).toBe('Portal Not Configured');
      expect(result.message).toContain('portal is not enabled');
    });

    it('handles configuration errors', () => {
      const error = new Error('Configuration error in payment system');
      const result = getPortalErrorMessage(error);
      
      expect(result.title).toBe('Configuration Error');
      expect(result.message).toContain('configuration issue');
    });

    it('handles authorization errors', () => {
      const error = new Error('Missing Authorization header');
      const result = getPortalErrorMessage(error);
      
      expect(result.title).toBe('Authentication Error');
      expect(result.message).toContain('refresh the page');
    });

    it('handles session expired errors', () => {
      const error = new Error('Session expired');
      const result = getPortalErrorMessage(error);
      
      expect(result.title).toBe('Session Expired');
      expect(result.message).toContain('session has expired');
    });

    it('handles generic portal errors', () => {
      const error = new Error('Unknown portal error');
      const result = getPortalErrorMessage(error);
      
      expect(result.title).toBe('Portal Error');
      expect(result.message).toContain('Unknown portal error');
    });
  });

  describe('validatePaymentRequirements', () => {
    it('validates missing user', () => {
      const result = validatePaymentRequirements(null, { stripe_price_id: 'price_123' });
      expect(result).toContain('Please log in');
    });

    it('validates missing stripe_price_id', () => {
      const user = { id: 'user_123' };
      const plan = { id: 'plan_123' };
      const result = validatePaymentRequirements(user, plan);
      
      expect(result).toContain('not available for purchase');
    });

    it('validates missing plan id', () => {
      const user = { id: 'user_123' };
      const plan = { stripe_price_id: 'price_123' };
      const result = validatePaymentRequirements(user, plan);
      
      expect(result).toContain('Invalid plan selected');
    });

    it('passes validation with valid inputs', () => {
      const user = { id: 'user_123' };
      const plan = { id: 'plan_123', stripe_price_id: 'price_123' };
      const result = validatePaymentRequirements(user, plan);
      
      expect(result).toBeNull();
    });
  });

  describe('formatErrorForLogging', () => {
    it('formats error with all properties', () => {
      const error = {
        type: 'stripe_error',
        code: 'card_declined',
        message: 'Your card was declined',
        user_id: 'user_123'
      };
      
      const result = formatErrorForLogging(error, 'test_context');
      
      expect(result).toEqual({
        context: 'test_context',
        type: 'stripe_error',
        code: 'card_declined',
        message: 'Your card was declined',
        timestamp: expect.any(String),
        hasUserData: true
      });
    });

    it('handles errors with missing properties', () => {
      const error = {};
      const result = formatErrorForLogging(error, 'test_context');
      
      expect(result).toEqual({
        context: 'test_context',
        type: 'unknown',
        code: 'unknown',
        message: 'Unknown error',
        timestamp: expect.any(String),
        hasUserData: false
      });
    });

    it('includes timestamp in ISO format', () => {
      const error = { message: 'test error' };
      const result = formatErrorForLogging(error, 'test_context');
      
      // Check if timestamp is valid ISO string
      expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    });
  });

  describe('showPaymentErrorToast', () => {
    it('calls toast.error with checkout context', () => {
      const error = new Error('Test checkout error');
      const onRetry = vi.fn();
      
      showPaymentErrorToast(error, 'checkout', onRetry);
      
      const { toast } = require('sonner');
      expect(toast.error).toHaveBeenCalledWith(
        'Checkout Error',
        expect.objectContaining({
          description: 'Test checkout error',
          duration: 6000,
          action: expect.objectContaining({
            label: 'Retry',
            onClick: onRetry
          })
        })
      );
    });

    it('calls toast.error with portal context', () => {
      const error = new Error('Test portal error');
      
      showPaymentErrorToast(error, 'portal');
      
      const { toast } = require('sonner');
      expect(toast.error).toHaveBeenCalledWith(
        'Portal Error',
        expect.objectContaining({
          description: 'Test portal error',
          duration: 6000,
          action: undefined
        })
      );
    });
  });

  describe('STRIPE_ERROR_CODES', () => {
    it('contains expected error codes', () => {
      expect(STRIPE_ERROR_CODES.card_declined).toBeDefined();
      expect(STRIPE_ERROR_CODES.insufficient_funds).toBeDefined();
      expect(STRIPE_ERROR_CODES.expired_card).toBeDefined();
      expect(STRIPE_ERROR_CODES.processing_error).toBeDefined();
    });

    it('has consistent structure for all error codes', () => {
      Object.values(STRIPE_ERROR_CODES).forEach(errorInfo => {
        expect(errorInfo).toHaveProperty('title');
        expect(errorInfo).toHaveProperty('message');
        expect(errorInfo).toHaveProperty('action');
        expect(typeof errorInfo.title).toBe('string');
        expect(typeof errorInfo.message).toBe('string');
        expect(typeof errorInfo.action).toBe('string');
      });
    });
  });
});