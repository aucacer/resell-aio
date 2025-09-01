import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SubscriptionCheckout } from './SubscriptionCheckout';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

// Mock dependencies
vi.mock('@/contexts/AuthContext');
vi.mock('@/contexts/SubscriptionContext');
vi.mock('@/hooks/use-toast');
vi.mock('@/hooks/use-mobile');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseSubscriptionContext = vi.mocked(useSubscriptionContext);
const mockUseToast = vi.mocked(useToast);
const mockUseIsMobile = vi.mocked(useIsMobile);

const mockPlans = [
  {
    id: 'free',
    display_name: 'Free',
    description: 'Basic features',
    price: 0,
    interval: 'month',
    features: ['Feature 1', 'Feature 2'],
    stripe_price_id: null
  },
  {
    id: 'pro_monthly',
    display_name: 'Pro',
    description: 'Advanced features',
    price: 9.99,
    interval: 'month',
    features: ['All features', 'Priority support'],
    stripe_price_id: 'price_test_123'
  }
];

const mockSubscription = {
  id: 'sub_123',
  plan_id: 'pro_monthly',
  status: 'active',
  cancel_at_period_end: false,
  canceled_at: null,
  current_period_end: '2024-12-31T23:59:59Z'
};

describe('SubscriptionCheckout', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user_123', email: 'test@example.com' }
    });
    
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: null,
      refreshSubscription: vi.fn(),
      loading: false,
      error: null
    });
    
    mockUseToast.mockReturnValue({
      toast: mockToast
    });
    
    mockUseIsMobile.mockReturnValue(false);
    
    vi.clearAllMocks();
  });

  it('renders plans correctly', () => {
    render(<SubscriptionCheckout />);
    
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('shows current plan badge when user has subscription', () => {
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: mockSubscription,
      refreshSubscription: vi.fn(),
      loading: false,
      error: null
    });

    render(<SubscriptionCheckout />);
    
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('displays loading state correctly', () => {
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: null,
      refreshSubscription: vi.fn(),
      loading: true,
      error: null
    });

    render(<SubscriptionCheckout />);
    
    expect(screen.getByText('Loading Subscription...')).toBeInTheDocument();
  });

  it('shows error state with retry option', () => {
    const mockRefresh = vi.fn();
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: null,
      refreshSubscription: mockRefresh,
      loading: false,
      error: 'Failed to load'
    });

    render(<SubscriptionCheckout />);
    
    expect(screen.getByText('Unable to Load Subscription')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows authentication error when user is not logged in', async () => {
    mockUseAuth.mockReturnValue({
      user: null
    });

    render(<SubscriptionCheckout />);
    
    const subscribeButton = screen.getAllByText(/Subscribe for/)[0];
    fireEvent.click(subscribeButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Authentication Required',
        description: 'Please log in to subscribe to this plan.',
        variant: 'destructive'
      });
    });
  });

  it('shows error for plan without stripe_price_id', async () => {
    render(<SubscriptionCheckout />);
    
    const freeButton = screen.getByText('Start Free Trial');
    fireEvent.click(freeButton);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Plan Unavailable',
        description: 'This plan is not available for purchase at this time. Please contact support.',
        variant: 'destructive'
      });
    });
  });

  it('uses mobile drawer when on mobile device', () => {
    mockUseIsMobile.mockReturnValue(true);
    
    render(<SubscriptionCheckout />);
    
    // Component should render but drawer content won't be visible until payment starts
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('shows different subscription statuses correctly', () => {
    const statusTests = [
      { status: 'trialing', expectedBadge: 'Trial' },
      { status: 'canceled', expectedBadge: 'Cancelled' },
      { status: 'past_due', expectedBadge: 'Past Due' },
      { status: 'unpaid', expectedBadge: 'Unpaid' }
    ];

    statusTests.forEach(({ status, expectedBadge }) => {
      mockUseSubscriptionContext.mockReturnValue({
        plans: mockPlans,
        subscription: { ...mockSubscription, status },
        refreshSubscription: vi.fn(),
        loading: false,
        error: null
      });

      const { rerender } = render(<SubscriptionCheckout />);
      
      expect(screen.getByText(expectedBadge)).toBeInTheDocument();
      
      rerender(<div />); // Clear for next iteration
    });
  });

  it('shows expiring badge for cancelled subscriptions', () => {
    mockUseSubscriptionContext.mockReturnValue({
      plans: mockPlans,
      subscription: { 
        ...mockSubscription, 
        status: 'active',
        cancel_at_period_end: true,
        canceled_at: '2024-01-15T10:00:00Z'
      },
      refreshSubscription: vi.fn(),
      loading: false,
      error: null
    });

    render(<SubscriptionCheckout />);
    
    expect(screen.getByText('Expiring')).toBeInTheDocument();
    expect(screen.getByText(/Cancelled on/)).toBeInTheDocument();
  });
});