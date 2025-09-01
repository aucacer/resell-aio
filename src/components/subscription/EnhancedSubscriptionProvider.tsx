import { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useSubscriptionSync } from '@/hooks/useSubscriptionSync';
import type { 
  SubscriptionContextType,
  EnhancedSubscriptionStatus,
  SyncStatus
} from '@/types/subscription';

interface EnhancedSubscriptionContextType extends SubscriptionContextType {
  // Enhanced status data
  enhancedStatus: EnhancedSubscriptionStatus | null;
  syncStatus: SyncStatus;
  syncHealth: {
    isHealthy: boolean;
    needsAttention: boolean;
    isPending: boolean;
    canRetry: boolean;
  };
  
  // Sync operations
  triggerManualSync: () => Promise<void>;
  canManualSync: boolean;
  hasSyncIssues: boolean;
  
  // Additional status information
  statusDisplay: string;
  requiresAttention: boolean;
  consistencyIssues: string[];
  timeSinceSync: number | null;
  
  // Actions
  refreshEnhancedStatus: () => Promise<void>;
}

const EnhancedSubscriptionContext = createContext<EnhancedSubscriptionContextType | undefined>(undefined);

export function useEnhancedSubscriptionContext() {
  const context = useContext(EnhancedSubscriptionContext);
  if (!context) {
    throw new Error('useEnhancedSubscriptionContext must be used within an EnhancedSubscriptionProvider');
  }
  return context;
}

interface EnhancedSubscriptionProviderProps {
  children: ReactNode;
}

export function EnhancedSubscriptionProvider({ children }: EnhancedSubscriptionProviderProps) {
  // Get base subscription context
  const baseContext = useSubscriptionContext();
  
  // Get enhanced status and sync capabilities
  const {
    enhancedStatus,
    currentStatus,
    statusDisplay,
    isHealthy,
    requiresAttention,
    hasSyncIssues,
    consistencyIssues,
    timeSinceSync,
    refreshStatus
  } = useSubscriptionStatus();

  const {
    syncStatus,
    syncHealth,
    triggerSync,
    canManualSync
  } = useSubscriptionSync();

  // Auto-sync on critical issues (with throttling)
  useEffect(() => {
    if (hasSyncIssues && syncHealth.canRetry && !syncHealth.isPending) {
      console.log('🔄 Auto-triggering sync for critical issues');
      triggerSync(false); // Don't show progress for auto-sync
    }
  }, [hasSyncIssues, syncHealth.canRetry, syncHealth.isPending, triggerSync]);

  // Enhanced context value
  const enhancedContextValue: EnhancedSubscriptionContextType = useMemo(() => {
    return {
      // Base subscription context
      ...baseContext,
      
      // Enhanced status data
      enhancedStatus,
      syncStatus,
      syncHealth,
      
      // Status information
      statusDisplay,
      requiresAttention,
      consistencyIssues,
      timeSinceSync,
      
      // Sync operations
      triggerManualSync: triggerSync,
      canManualSync,
      hasSyncIssues,
      
      // Actions
      refreshEnhancedStatus: refreshStatus,
    };
  }, [
    baseContext,
    enhancedStatus,
    syncStatus,
    syncHealth,
    statusDisplay,
    requiresAttention,
    consistencyIssues,
    timeSinceSync,
    triggerSync,
    canManualSync,
    hasSyncIssues,
    refreshStatus
  ]);

  return (
    <EnhancedSubscriptionContext.Provider value={enhancedContextValue}>
      {children}
    </EnhancedSubscriptionContext.Provider>
  );
}

// Export the provider as default
export { EnhancedSubscriptionProvider as default };