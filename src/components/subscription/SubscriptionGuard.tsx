import { ReactNode } from 'react';
import { useEnhancedSubscriptionContext } from './EnhancedSubscriptionProvider';

interface SubscriptionGuardProps {
  children: ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { loading, error, initialLoadComplete, hasSyncIssues, requiresAttention } = useEnhancedSubscriptionContext();

  // Show loading spinner during initial load
  if (loading || !initialLoadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If there's an error loading subscription data, allow access to prevent being locked out
  if (error) {
    console.warn('Subscription guard: Error loading subscription data, allowing access:', error);
    return <>{children}</>;
  }

  // Always allow access - subscription management is handled within the app via Settings page
  return <>{children}</>;
}