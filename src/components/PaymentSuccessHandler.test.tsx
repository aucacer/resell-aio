import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { PaymentSuccessHandler } from './PaymentSuccessHandler';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('@/contexts/AuthContext');
vi.mock('@/contexts/SubscriptionContext');
vi.mock('@/hooks/use-toast');
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn()
    },
    functions: {
      invoke: vi.fn()
    }
  }
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseSubscriptionContext = vi.mocked(useSubscriptionContext);
const mockUseToast = vi.mocked(useToast);

// Create a test wrapper with Router
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

// Mock URLSearchParams
const mockSearchParams = new Map();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
    useNavigate: () => vi.fn()
  };
});

describe('PaymentSuccessHandler', () => {
  const mockToast = vi.fn();
  const mockRefreshSubscription = vi.fn();

  beforeEach(() => {
    mockSearchParams.clear();
    mockSetSearchParams.mockClear();
    
    mockUseAuth.mockReturnValue({
      user: { id: 'user_123', email: 'test@example.com' }
    });
    
    mockUseSubscriptionContext.mockReturnValue({
      refreshSubscription: mockRefreshSubscription,
      subscription: null
    });
    
    mockUseToast.mockReturnValue({
      toast: mockToast
    });
    
    vi.clearAllMocks();
  });

  it('does nothing when success parameter is not present', async () => {
    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    // Wait a bit to ensure no processing happens
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockToast).not.toHaveBeenCalled();
    expect(mockRefreshSubscription).not.toHaveBeenCalled();
  });

  it('does nothing when user is not logged in', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    mockUseAuth.mockReturnValue({
      user: null
    });

    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockToast).not.toHaveBeenCalled();
  });

  it('processes payment success correctly', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    const { supabase } = require('@/integrations/supabase/client');
    
    // Mock successful RPC response
    supabase.rpc.mockResolvedValueOnce({
      data: {
        found: true,
        subscription: {
          status: 'active',
          plan_id: 'pro_monthly'
        }
      },
      error: null
    });

    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    // Should show success modal
    await waitFor(() => {
      expect(screen.getByText('Processing Payment...')).toBeInTheDocument();
    });

    // Wait for activation to complete
    await waitFor(
      () => {
        expect(screen.getByText('Subscription Activated!')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(mockRefreshSubscription).toHaveBeenCalled();
  });

  it('falls back to sync function when RPC fails', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    const { supabase } = require('@/integrations/supabase/client');
    
    // Mock RPC failure
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('RPC failed')
    });

    // Mock auth session
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'test_token'
        }
      }
    });

    // Mock successful sync response
    supabase.functions.invoke.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          status: 'active',
          plan_id: 'pro_monthly'
        }
      },
      error: null
    });

    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    await waitFor(
      () => {
        expect(screen.getByText('Subscription Activated!')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(supabase.functions.invoke).toHaveBeenCalledWith('sync-subscription', {
      headers: {
        Authorization: 'Bearer test_token'
      }
    });
  });

  it('shows error message when activation fails', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    const { supabase } = require('@/integrations/supabase/client');
    
    // Mock RPC failure
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('RPC failed')
    });

    // Mock auth failure
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null }
    });

    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    // Should eventually show fallback message via toast
    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Activation Taking Longer Than Expected',
            description: expect.stringContaining('payment was successful')
          })
        );
      },
      { timeout: 10000 }
    );
  });

  it('cleans up URL parameters', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    mockSearchParams.set('other_param', 'keep_this');
    
    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled();
    });

    // Check that success and session_id were removed but other params kept
    const callArgs = mockSetSearchParams.mock.calls[0][0];
    expect(callArgs.get('success')).toBeNull();
    expect(callArgs.get('session_id')).toBeNull();
    expect(callArgs.get('other_param')).toBe('keep_this');
  });

  it('shows success features when activation completes', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    const { supabase } = require('@/integrations/supabase/client');
    
    supabase.rpc.mockResolvedValueOnce({
      data: {
        found: true,
        subscription: {
          status: 'active',
          plan_id: 'pro_monthly'
        }
      },
      error: null
    });

    render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    await waitFor(
      () => {
        expect(screen.getByText('What\'s unlocked:')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(screen.getByText('Unlimited inventory items')).toBeInTheDocument();
    expect(screen.getByText('Advanced profit tracking')).toBeInTheDocument();
    expect(screen.getByText('Priority customer support')).toBeInTheDocument();
    
    expect(screen.getByRole('button', { name: /Explore Features/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeInTheDocument();
  });

  it('prevents duplicate processing', async () => {
    mockSearchParams.set('success', 'true');
    mockSearchParams.set('session_id', 'cs_test_123');
    
    const { supabase } = require('@/integrations/supabase/client');
    
    supabase.rpc.mockResolvedValue({
      data: {
        found: true,
        subscription: {
          status: 'active',
          plan_id: 'pro_monthly'
        }
      },
      error: null
    });

    const { rerender } = render(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    // Re-render to trigger effect again
    rerender(
      <TestWrapper>
        <PaymentSuccessHandler />
      </TestWrapper>
    );

    // Should only call RPC once
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });
  });
});