import { useState, useCallback, useRef, useEffect } from 'react';

export type PaymentStep = 'idle' | 'creating' | 'redirecting' | 'processing' | 'completed' | 'failed';

export interface PaymentState {
  step: PaymentStep;
  progress: number;
  isLoading: boolean;
  error: string | null;
  planId: string | null;
}

export interface PaymentActions {
  startPayment: (planId: string) => void;
  updateStep: (step: PaymentStep) => void;
  updateProgress: (progress: number) => void;
  setError: (error: string) => void;
  clearError: () => void;
  reset: () => void;
  completePayment: () => void;
}

const STEP_PROGRESS_MAP: Record<PaymentStep, number> = {
  idle: 0,
  creating: 25,
  redirecting: 75,
  processing: 90,
  completed: 100,
  failed: 0,
};

const STEP_DESCRIPTIONS: Record<PaymentStep, { title: string; description: string }> = {
  idle: {
    title: 'Ready to start',
    description: 'Click to begin your subscription'
  },
  creating: {
    title: 'Creating checkout session...',
    description: 'Setting up your secure payment session'
  },
  redirecting: {
    title: 'Redirecting to payment...',
    description: 'Taking you to our secure payment page'
  },
  processing: {
    title: 'Processing payment...',
    description: 'Please complete your payment to continue'
  },
  completed: {
    title: 'Payment successful!',
    description: 'Your subscription has been activated'
  },
  failed: {
    title: 'Payment failed',
    description: 'There was an issue processing your payment'
  }
};

export function usePaymentState() {
  const [state, setState] = useState<PaymentState>({
    step: 'idle',
    progress: 0,
    isLoading: false,
    error: null,
    planId: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout>();

  // Auto-reset error after 5 seconds
  useEffect(() => {
    if (state.error) {
      const timeout = setTimeout(() => {
        setState(prev => ({ ...prev, error: null }));
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [state.error]);

  const startPayment = useCallback((planId: string) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState({
      step: 'creating',
      progress: STEP_PROGRESS_MAP.creating,
      isLoading: true,
      error: null,
      planId,
    });
  }, []);

  const updateStep = useCallback((step: PaymentStep) => {
    const progress = STEP_PROGRESS_MAP[step];
    const isLoading = step !== 'idle' && step !== 'completed' && step !== 'failed';

    setState(prev => ({
      ...prev,
      step,
      progress,
      isLoading,
    }));

    // Auto-complete progress for redirecting step
    if (step === 'redirecting') {
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          progress: 100,
        }));
      }, 500);
    }

    // Auto-reset after completion or failure (with delay for user to see the state)
    if (step === 'completed' || step === 'failed') {
      timeoutRef.current = setTimeout(() => {
        setState({
          step: 'idle',
          progress: 0,
          isLoading: false,
          error: null,
          planId: null,
        });
      }, 3000);
    }
  }, []);

  const updateProgress = useCallback((progress: number) => {
    setState(prev => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress)),
    }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      step: 'failed',
      progress: 0,
      isLoading: false,
      error,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState({
      step: 'idle',
      progress: 0,
      isLoading: false,
      error: null,
      planId: null,
    });
  }, []);

  const completePayment = useCallback(() => {
    updateStep('completed');
  }, [updateStep]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Helper functions
  const getStepDescription = (step?: PaymentStep) => {
    return STEP_DESCRIPTIONS[step || state.step];
  };

  const isStepActive = (step: PaymentStep) => {
    const stepOrder: PaymentStep[] = ['idle', 'creating', 'redirecting', 'processing', 'completed'];
    const currentIndex = stepOrder.indexOf(state.step);
    const checkIndex = stepOrder.indexOf(step);
    return checkIndex <= currentIndex;
  };

  const isStepCompleted = (step: PaymentStep) => {
    const stepOrder: PaymentStep[] = ['idle', 'creating', 'redirecting', 'processing', 'completed'];
    const currentIndex = stepOrder.indexOf(state.step);
    const checkIndex = stepOrder.indexOf(step);
    return checkIndex < currentIndex || (state.step === 'completed' && step !== 'completed');
  };

  const actions: PaymentActions = {
    startPayment,
    updateStep,
    updateProgress,
    setError,
    clearError,
    reset,
    completePayment,
  };

  return {
    ...state,
    actions,
    getStepDescription,
    isStepActive,
    isStepCompleted,
  };
}

export type UsePaymentStateReturn = ReturnType<typeof usePaymentState>;