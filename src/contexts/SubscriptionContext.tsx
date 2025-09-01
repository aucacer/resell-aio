import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import type { SubscriptionContextType } from '@/types/subscription';

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Separate the hook to fix Fast Refresh compatibility
function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  }
  return context;
}

// Export the hook
export { useSubscriptionContext };

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider = ({ children }: SubscriptionProviderProps) => {
  const subscriptionData = useSubscription();

  const contextValue: SubscriptionContextType = useMemo(() => {
    console.log('🔍 SubscriptionContext memoization:', { subscriptionData: subscriptionData.subscription });
    return {
      ...subscriptionData,
      canAddInventory: false, // This will be determined dynamically when needed
    };
  }, [subscriptionData]);

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};