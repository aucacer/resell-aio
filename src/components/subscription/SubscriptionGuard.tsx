import { ReactNode } from 'react';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Navigate } from 'react-router-dom';

interface SubscriptionGuardProps {
  children: ReactNode;
  fallbackPath?: string;
  requiresAccess?: boolean;
}

export function SubscriptionGuard({ 
  children, 
  fallbackPath = '/payment-required',
  requiresAccess = true 
}: SubscriptionGuardProps) {
  const { hasAccess, loading } = useSubscriptionContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (requiresAccess && !hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}