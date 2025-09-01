import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePaymentState } from './usePaymentState';

describe('usePaymentState', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => usePaymentState());

    expect(result.current.step).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.planId).toBeNull();
  });

  it('starts payment correctly', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.startPayment('plan_123');
    });

    expect(result.current.step).toBe('creating');
    expect(result.current.progress).toBe(25);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.planId).toBe('plan_123');
  });

  it('updates step and progress correctly', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.updateStep('redirecting');
    });

    expect(result.current.step).toBe('redirecting');
    expect(result.current.progress).toBe(75);
    expect(result.current.isLoading).toBe(true);

    // Test auto-completion for redirecting step
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.progress).toBe(100);
  });

  it('handles completion state', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.updateStep('completed');
    });

    expect(result.current.step).toBe('completed');
    expect(result.current.progress).toBe(100);
    expect(result.current.isLoading).toBe(false);

    // Should auto-reset after 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.step).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.planId).toBeNull();
  });

  it('handles failure state', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.setError('Payment failed');
    });

    expect(result.current.step).toBe('failed');
    expect(result.current.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Payment failed');

    // Should auto-reset after 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.step).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('auto-clears error after 5 seconds', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.setError('Test error');
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.error).toBeNull();
  });

  it('updates progress manually', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.updateProgress(50);
    });

    expect(result.current.progress).toBe(50);

    // Test bounds
    act(() => {
      result.current.actions.updateProgress(-10);
    });

    expect(result.current.progress).toBe(0);

    act(() => {
      result.current.actions.updateProgress(150);
    });

    expect(result.current.progress).toBe(100);
  });

  it('clears error manually', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.setError('Test error');
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      result.current.actions.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('resets state manually', () => {
    const { result } = renderHook(() => usePaymentState());

    // Set up some state
    act(() => {
      result.current.actions.startPayment('plan_123');
      result.current.actions.updateStep('redirecting');
      result.current.actions.setError('Test error');
    });

    // Reset
    act(() => {
      result.current.actions.reset();
    });

    expect(result.current.step).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.planId).toBeNull();
  });

  it('completes payment', () => {
    const { result } = renderHook(() => usePaymentState());

    act(() => {
      result.current.actions.completePayment();
    });

    expect(result.current.step).toBe('completed');
    expect(result.current.progress).toBe(100);
    expect(result.current.isLoading).toBe(false);
  });

  describe('step helpers', () => {
    it('returns correct step descriptions', () => {
      const { result } = renderHook(() => usePaymentState());

      const idleDesc = result.current.getStepDescription('idle');
      expect(idleDesc.title).toBe('Ready to start');
      expect(idleDesc.description).toBe('Click to begin your subscription');

      const creatingDesc = result.current.getStepDescription('creating');
      expect(creatingDesc.title).toBe('Creating checkout session...');
      expect(creatingDesc.description).toBe('Setting up your secure payment session');
    });

    it('checks if step is active', () => {
      const { result } = renderHook(() => usePaymentState());

      act(() => {
        result.current.actions.updateStep('redirecting');
      });

      expect(result.current.isStepActive('idle')).toBe(true);
      expect(result.current.isStepActive('creating')).toBe(true);
      expect(result.current.isStepActive('redirecting')).toBe(true);
      expect(result.current.isStepActive('processing')).toBe(false);
      expect(result.current.isStepActive('completed')).toBe(false);
    });

    it('checks if step is completed', () => {
      const { result } = renderHook(() => usePaymentState());

      act(() => {
        result.current.actions.updateStep('redirecting');
      });

      expect(result.current.isStepCompleted('idle')).toBe(true);
      expect(result.current.isStepCompleted('creating')).toBe(true);
      expect(result.current.isStepCompleted('redirecting')).toBe(false);
      expect(result.current.isStepCompleted('processing')).toBe(false);
    });

    it('handles completed state in step helpers', () => {
      const { result } = renderHook(() => usePaymentState());

      act(() => {
        result.current.actions.updateStep('completed');
      });

      expect(result.current.isStepCompleted('creating')).toBe(true);
      expect(result.current.isStepCompleted('redirecting')).toBe(true);
      expect(result.current.isStepCompleted('processing')).toBe(true);
      expect(result.current.isStepCompleted('completed')).toBe(false);
    });
  });

  it('prevents timeout conflicts when starting new payment', () => {
    const { result } = renderHook(() => usePaymentState());

    // Start first payment
    act(() => {
      result.current.actions.startPayment('plan_1');
      result.current.actions.updateStep('completed');
    });

    // Start second payment before auto-reset
    act(() => {
      result.current.actions.startPayment('plan_2');
    });

    expect(result.current.step).toBe('creating');
    expect(result.current.planId).toBe('plan_2');

    // First timeout should not interfere
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.step).toBe('creating'); // Should still be in creating state
    expect(result.current.planId).toBe('plan_2');
  });
});