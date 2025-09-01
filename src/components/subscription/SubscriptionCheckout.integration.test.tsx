import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { SubscriptionCheckout } from './SubscriptionCheckout';
import { PaymentSuccessHandler } from '../PaymentSuccessHandler';
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

const mockSupabase = {
  functions: {
    invoke: vi.fn()
  },
  rpc: vi.fn(),
  auth: {
    getSession: vi.fn()
  }
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseSubscriptionContext = vi.mocked(useSubscriptionContext);
const mockUseToast = vi.mocked(useToast);

// Test wrapper with router
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

const mockPlans = [
  {
    id: 'free_trial',
    display_name: 'Free Trial',
    description: 'Get started for free',
    price: 0,
    interval: 'month',
    features: ['5 inventory items', 'Basic tracking'],
    stripe_price_id: null
  },
  {
    id: 'pro_monthly',
    display_name: 'Pro Monthly',
    description: 'Unlimited features',
    price: 9.99,
    interval: 'month',
    features: ['Unlimited items', 'Advanced analytics', 'Priority support'],
    stripe_price_id: 'price_pro_monthly'
  }
];

describe('SubscriptionCheckout Integration Tests', () => {
  const mockToast = vi.fn();
  const mockRefreshSubscription = vi.fn();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up default mock returns
    mockUseAuth.mockReturnValue({
      user: { id: 'user_123', email: 'test@example.com' }
    });
    
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: null,
      refreshSubscription: mockRefreshSubscription,
      loading: false,
      error: null
    });
    
    mockUseToast.mockReturnValue({
      toast: mockToast
    });

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000'
      },
      writable: true
    });
  });

  describe('Complete Checkout Flow', () => {
    it('successfully creates checkout session and redirects', async () => {
      // Mock successful checkout session creation
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          checkout_url: 'https://checkout.stripe.com/test_session'
        },
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      // Find and click the Pro Monthly subscribe button
      const proCard = screen.getByText('Pro Monthly').closest('[class*="Card"]');
      const subscribeButton = within(proCard!).getByRole('button', { name: /Subscribe for/ });
      
      fireEvent.click(subscribeButton);

      // Should show payment progress modal
      await waitFor(() => {
        expect(screen.getByText('Processing Payment')).toBeInTheDocument();
      });

      expect(screen.getByText('Creating checkout session...')).toBeInTheDocument();

      // Verify checkout session was called with correct parameters
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('create-checkout-session', {
        body: {
          price_id: 'price_pro_monthly',
          success_url: 'http://localhost:3000/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost:3000/settings',
        }
      });

      // Should progress through states
      await waitFor(() => {
        expect(screen.getByText('Redirecting to payment...')).toBeInTheDocument();
      });

      // Note: In real test, we can't test actual redirect as jsdom doesn't support it
      // But we can verify the function was called
    });

    it('handles checkout session creation errors gracefully', async () => {
      // Mock checkout session failure
      mockSupabase.functions.invoke.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const proCard = screen.getByText('Pro Monthly').closest('[class*="Card"]');
      const subscribeButton = within(proCard!).getByRole('button', { name: /Subscribe for/ });
      
      fireEvent.click(subscribeButton);

      // Should show error toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Checkout Error',
            description: 'Network error',
            variant: 'destructive'
          })
        );
      });

      // Should reset loading state after delay
      await waitFor(() => {
        const button = within(proCard!).getByRole('button', { name: /Subscribe for/ });
        expect(button).not.toBeDisabled();
      }, { timeout: 3000 });
    });

    it('shows specific error for timeout', async () => {
      // Mock timeout error
      mockSupabase.functions.invoke.mockRejectedValueOnce(new Error('Request timed out'));

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const proCard = screen.getByText('Pro Monthly').closest('[class*="Card"]');
      const subscribeButton = within(proCard!).getByRole('button', { name: /Subscribe for/ });
      
      fireEvent.click(subscribeButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Connection Timeout',
            description: expect.stringContaining('taking too long'),
            duration: 10000
          })
        );
      });
    });

    it('prevents multiple simultaneous subscriptions', async () => {
      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const proCard = screen.getByText('Pro Monthly').closest('[class*="Card"]');
      const subscribeButton = within(proCard!).getByRole('button', { name: /Subscribe for/ });
      
      // Click multiple times quickly
      fireEvent.click(subscribeButton);
      fireEvent.click(subscribeButton);
      fireEvent.click(subscribeButton);

      // Should only call checkout once
      await waitFor(() => {
        expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Customer Portal Flow', () => {
    beforeEach(() => {
      // Mock user with active subscription
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: {
          id: 'sub_123',
          plan_id: 'pro_monthly',
          status: 'active',
          cancel_at_period_end: false,
          canceled_at: null,
          current_period_end: '2024-12-31T23:59:59Z'
        },
        refreshSubscription: mockRefreshSubscription,
        loading: false,
        error: null
      });
    });

    it('successfully opens customer portal', async () => {
      // Mock portal session creation
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          portal_url: 'https://billing.stripe.com/p/session_test'
        },
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const manageButton = screen.getByRole('button', { name: /Manage Subscription/ });
      fireEvent.click(manageButton);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('create-portal-session', {
        body: {
          return_url: 'http://localhost:3000/settings?portal_return=true'
        }
      });

      // Should show loading state
      expect(screen.getByText('Opening Portal...')).toBeInTheDocument();
    });

    it('handles portal creation errors', async () => {
      mockSupabase.functions.invoke.mockRejectedValueOnce(
        new Error('Customer portal is not enabled')
      );

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const manageButton = screen.getByRole('button', { name: /Manage Subscription/ });
      fireEvent.click(manageButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Portal Not Configured',
            description: expect.stringContaining('portal is not enabled')
          })
        );
      });
    });
  });

  describe('Subscription Status Display', () => {
    it('shows current active subscription correctly', () => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: {
          id: 'sub_123',
          plan_id: 'pro_monthly',
          status: 'active',
          cancel_at_period_end: false,
          canceled_at: null,
          current_period_end: '2024-12-31T23:59:59Z'
        },
        refreshSubscription: mockRefreshSubscription,
        loading: false,
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Pro Monthly')).toBeInTheDocument();
      expect(screen.getByText(/Renews on/)).toBeInTheDocument();
    });

    it('shows expiring subscription correctly', () => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: {
          id: 'sub_123',
          plan_id: 'pro_monthly',
          status: 'active',
          cancel_at_period_end: true,
          canceled_at: '2024-01-15T10:00:00Z',
          current_period_end: '2024-12-31T23:59:59Z'
        },
        refreshSubscription: mockRefreshSubscription,
        loading: false,
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      expect(screen.getByText('Expiring')).toBeInTheDocument();
      expect(screen.getByText(/Expires on/)).toBeInTheDocument();
      expect(screen.getByText(/Cancelled on/)).toBeInTheDocument();
    });

    it('shows trial subscription correctly', () => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: {
          id: 'sub_123',
          plan_id: 'pro_monthly',
          status: 'trialing',
          cancel_at_period_end: false,
          canceled_at: null,
          current_period_end: '2024-12-31T23:59:59Z'
        },
        refreshSubscription: mockRefreshSubscription,
        loading: false,
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      expect(screen.getByText('Trial')).toBeInTheDocument();
      expect(screen.getByText(/Trial ends on/)).toBeInTheDocument();
    });
  });

  describe('Error Recovery', () => {
    it('provides retry functionality for failed checkouts', async () => {
      // First attempt fails
      mockSupabase.functions.invoke.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      const proCard = screen.getByText('Pro Monthly').closest('[class*="Card"]');
      const subscribeButton = within(proCard!).getByRole('button', { name: /Subscribe for/ });
      
      fireEvent.click(subscribeButton);

      // Wait for error toast with retry option
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            action: expect.objectContaining({
              label: 'Retry'
            })
          })
        );
      });

      // Simulate retry click (we'd need to extract the retry function from the toast call)
      const retryFunction = mockToast.mock.calls[0][0].action.onClick;
      
      // Second attempt succeeds
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          checkout_url: 'https://checkout.stripe.com/test_session'
        },
        error: null
      });

      retryFunction();

      // Should make another attempt
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(2);
    });
  });

  describe('Loading States', () => {
    it('shows proper loading states during subscription data fetch', () => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: [],
        subscription: null,
        refreshSubscription: mockRefreshSubscription,
        loading: true,
        error: null
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      expect(screen.getByText('Loading Subscription...')).toBeInTheDocument();
    });

    it('shows error state with retry when subscription loading fails', () => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: null,
        refreshSubscription: mockRefreshSubscription,
        loading: false,
        error: 'Failed to load subscription data'
      });

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      expect(screen.getByText('Unable to Load Subscription')).toBeInTheDocument();
      
      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);
      
      expect(mockRefreshSubscription).toHaveBeenCalled();
    });
  });

  describe('Responsive Behavior', () => {
    it('renders correctly on mobile', () => {
      // Mock mobile view
      vi.mocked(require('@/hooks/use-mobile').useIsMobile).mockReturnValue(true);

      render(
        <TestWrapper>
          <SubscriptionCheckout />
        </TestWrapper>
      );

      // Should still render plans but with mobile-optimized layout
      expect(screen.getByText('Pro Monthly')).toBeInTheDocument();
      expect(screen.getByText('Free Trial')).toBeInTheDocument();
    });
  });
});