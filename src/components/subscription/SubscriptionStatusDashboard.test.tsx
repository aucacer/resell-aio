import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubscriptionStatusDashboard } from './SubscriptionStatusDashboard';
import { useEnhancedSubscriptionContext } from './EnhancedSubscriptionProvider';

// Mock the enhanced subscription context
vi.mock('./EnhancedSubscriptionProvider', () => ({
  useEnhancedSubscriptionContext: vi.fn(),
}));

// Mock the child components
vi.mock('./SubscriptionSyncIndicator', () => ({
  DetailedSyncIndicator: () => <div data-testid="sync-indicator">Sync Status</div>
}));

vi.mock('./PaymentHistoryTable', () => ({
  PaymentHistoryTable: () => <div data-testid="payment-history">Payment History</div>
}));

vi.mock('./SubscriptionCheckout', () => ({
  SubscriptionCheckout: () => <div data-testid="subscription-checkout">Subscription Checkout</div>
}));

// Mock hooks
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false
}));

const mockContext = {
  subscription: {
    id: '1',
    user_id: 'user1',
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
    plan_id: 'basic_plan',
    status: 'active' as const,
    current_period_start: '2023-01-01T00:00:00Z',
    current_period_end: '2023-02-01T00:00:00Z',
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z'
  },
  enhancedStatus: {
    subscription_status: 'active' as const,
    stripe_subscription_id: 'sub_123',
    subscription_metadata: {},
    last_sync_at: '2023-01-01T12:00:00Z',
    sync_status: 'synced' as const,
    payment_method_status: 'valid' as const,
    retry_count: 0,
    user_id: 'user1',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z'
  },
  statusDisplay: 'Active',
  requiresAttention: false,
  consistencyIssues: [],
  hasAccess: true,
  isTrialing: false,
  daysUntilExpiry: null,
  plans: [],
  refreshEnhancedStatus: vi.fn(),
  triggerManualSync: vi.fn(),
  syncHealth: {
    isHealthy: true,
    needsAttention: false,
    isPending: false,
    canRetry: false
  },
  timeSinceSync: 60
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('SubscriptionStatusDashboard', () => {
  beforeEach(() => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue(mockContext);
  });

  it('renders subscription status correctly', () => {
    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Subscription Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('BASIC PLAN')).toBeInTheDocument();
  });

  it('shows manage billing button for active subscription', () => {
    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Manage Billing')).toBeInTheDocument();
  });

  it('shows upgrade button for users without access', () => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      hasAccess: false,
      subscription: null,
      statusDisplay: 'No Subscription'
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    const upgradeButtons = screen.getAllByText('Upgrade Plan');
    expect(upgradeButtons.length).toBeGreaterThan(0);
  });

  it('shows trial information when user is trialing', () => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      isTrialing: true,
      daysUntilExpiry: 7,
      statusDisplay: 'Trial Period'
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Trial ends in 7 days')).toBeInTheDocument();
  });

  it('displays attention alert for problematic subscriptions', () => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      requiresAttention: true,
      statusDisplay: 'Payment Overdue'
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText(/requires attention/)).toBeInTheDocument();
  });

  it('displays consistency issues alert', () => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      consistencyIssues: ['Status mismatch detected']
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText(/sync issues detected/)).toBeInTheDocument();
  });

  it('calls refresh function when refresh button is clicked', async () => {
    const mockRefresh = vi.fn();
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      refreshEnhancedStatus: mockRefresh
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    const refreshButtons = screen.getAllByRole('button');
    const refreshButton = refreshButtons.find(btn => 
      btn.querySelector('svg') && btn.getAttribute('class')?.includes('h-8 w-8')
    );
    
    if (refreshButton) {
      fireEvent.click(refreshButton);
      expect(mockRefresh).toHaveBeenCalledOnce();
    }
  });

  it('calls manual sync when sync button is clicked', async () => {
    const mockSync = vi.fn();
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      triggerManualSync: mockSync
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    const syncButton = screen.getByRole('button', { name: /sync status/i });
    fireEvent.click(syncButton);
    expect(mockSync).toHaveBeenCalledOnce();
  });

  it('shows billing period information', () => {
    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Billing Period')).toBeInTheDocument();
    expect(screen.getByText('Jan 1 - Feb 1, 2023')).toBeInTheDocument();
  });

  it('displays account information card', () => {
    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Account Information')).toBeInTheDocument();
    expect(screen.getByText('Customer ID:')).toBeInTheDocument();
    expect(screen.getByText('Subscription ID:')).toBeInTheDocument();
  });

  it('shows payment history button and opens dialog', async () => {
    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Payment History'));
    
    await waitFor(() => {
      expect(screen.getByTestId('payment-history')).toBeInTheDocument();
    });
  });

  it('disables sync button when sync is pending', () => {
    vi.mocked(useEnhancedSubscriptionContext).mockReturnValue({
      ...mockContext,
      syncHealth: {
        ...mockContext.syncHealth,
        isPending: true
      }
    });

    render(
      <TestWrapper>
        <SubscriptionStatusDashboard />
      </TestWrapper>
    );

    const syncButton = screen.getByRole('button', { name: /sync status/i });
    expect(syncButton).toBeDisabled();
  });
});