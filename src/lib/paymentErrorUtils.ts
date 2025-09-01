import { toast } from 'sonner';

/**
 * Stripe error codes and their user-friendly messages
 * Source: https://stripe.com/docs/api/errors
 */
export const STRIPE_ERROR_CODES = {
  // Card errors
  'card_declined': {
    title: 'Card Declined',
    message: 'Your card was declined. Please try a different payment method or contact your bank.',
    action: 'Try another card or contact your bank'
  },
  'insufficient_funds': {
    title: 'Insufficient Funds',
    message: 'Your card has insufficient funds. Please use a different payment method.',
    action: 'Use a different payment method or add funds to your account'
  },
  'expired_card': {
    title: 'Card Expired',
    message: 'Your card has expired. Please use a different payment method.',
    action: 'Update your payment method with a valid card'
  },
  'incorrect_cvc': {
    title: 'Invalid Security Code',
    message: 'Your card\'s security code is incorrect. Please check and try again.',
    action: 'Check your security code and try again'
  },
  'processing_error': {
    title: 'Processing Error',
    message: 'We encountered an error processing your card. Please try again.',
    action: 'Try again or use a different payment method'
  },

  // Authentication errors
  'authentication_required': {
    title: 'Authentication Required',
    message: 'Your bank requires additional authentication. Please complete the verification.',
    action: 'Complete authentication with your bank'
  },
  
  // Rate limiting
  'rate_limit': {
    title: 'Too Many Attempts',
    message: 'You\'ve made too many requests. Please wait a moment before trying again.',
    action: 'Wait a few minutes and try again'
  },

  // API errors
  'api_connection_error': {
    title: 'Connection Error',
    message: 'Unable to connect to our payment processor. Please check your connection.',
    action: 'Check your internet connection and try again'
  },
  'api_error': {
    title: 'Payment System Error',
    message: 'Our payment system is experiencing issues. Please try again later.',
    action: 'Try again in a few minutes or contact support'
  },
  'invalid_request_error': {
    title: 'Invalid Request',
    message: 'There was an error with your payment request. Please try again.',
    action: 'Refresh the page and try again'
  }
} as const;

/**
 * Network and general error patterns
 */
export const NETWORK_ERROR_PATTERNS = {
  timeout: /timed?\s?out|timeout/i,
  network: /network|failed to fetch|networkerror/i,
  unauthorized: /unauthorized|403|forbidden/i,
  server_error: /500|internal server error|server error/i,
  too_many_requests: /429|too many requests/i,
  not_found: /404|not found/i
} as const;

/**
 * Enhanced error message for checkout session creation
 */
export function getCheckoutErrorMessage(error: any): { title: string; message: string; action?: string; duration?: number } {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  // Check for timeout errors
  if (NETWORK_ERROR_PATTERNS.timeout.test(errorMessage)) {
    return {
      title: 'Connection Timeout',
      message: 'The request is taking too long. Please check your internet connection and try again.',
      action: 'Check your connection and retry',
      duration: 10000
    };
  }
  
  // Check for unauthorized/session errors
  if (NETWORK_ERROR_PATTERNS.unauthorized.test(errorMessage) || errorMessage.includes('unauthorized')) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please refresh the page and try again.',
      action: 'Refresh the page and log in again',
      duration: 8000
    };
  }
  
  // Check for network errors
  if (NETWORK_ERROR_PATTERNS.network.test(errorMessage)) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to our servers. Please check your internet connection and try again.',
      action: 'Check your internet connection',
      duration: 8000
    };
  }
  
  // Check for rate limiting
  if (NETWORK_ERROR_PATTERNS.too_many_requests.test(errorMessage)) {
    return {
      title: 'Too Many Requests',
      message: 'Please wait a moment before trying again.',
      action: 'Wait a few minutes and retry',
      duration: 8000
    };
  }
  
  // Check for server errors
  if (NETWORK_ERROR_PATTERNS.server_error.test(errorMessage)) {
    return {
      title: 'Server Error',
      message: 'Our servers are experiencing issues. Please try again in a few minutes.',
      action: 'Try again in a few minutes',
      duration: 8000
    };
  }
  
  // Specific Stripe/payment errors
  if (errorMessage.includes('missing required field')) {
    return {
      title: 'Configuration Error',
      message: 'There is a configuration issue with this plan. Please contact support.',
      action: 'Contact support for assistance'
    };
  }
  
  if (errorMessage.includes('no such price') || errorMessage.includes('price not found')) {
    return {
      title: 'Plan Unavailable',
      message: 'This plan is no longer available. Please refresh the page and try another plan.',
      action: 'Refresh the page and select another plan'
    };
  }
  
  if (errorMessage.includes('invalid response') || errorMessage.includes('missing checkout url')) {
    return {
      title: 'Service Error',
      message: 'There was an issue creating your checkout session. Please try again.',
      action: 'Try again or contact support if the issue persists'
    };
  }
  
  // Generic fallback
  return {
    title: 'Checkout Error',
    message: error?.message || 'Failed to create checkout session. Please try again.',
    action: 'Try again or contact support if the issue continues'
  };
}

/**
 * Enhanced error message for customer portal
 */
export function getPortalErrorMessage(error: any): { title: string; message: string; action?: string } {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  // Portal-specific errors
  if (errorMessage.includes('customer portal is not enabled')) {
    return {
      title: 'Portal Not Configured',
      message: 'The customer portal is not enabled. Please contact support.',
      action: 'Contact support for assistance'
    };
  }
  
  if (errorMessage.includes('configuration error')) {
    return {
      title: 'Configuration Error',
      message: 'There is a configuration issue with the payment system. Please contact support.',
      action: 'Contact support for assistance'
    };
  }
  
  if (errorMessage.includes('missing authorization') || errorMessage.includes('unauthorized')) {
    return {
      title: 'Authentication Error',
      message: 'Please refresh the page and log in again.',
      action: 'Refresh the page and log in'
    };
  }
  
  if (errorMessage.includes('session expired')) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please refresh the page and try again.',
      action: 'Refresh the page'
    };
  }
  
  // Generic fallback
  return {
    title: 'Portal Error',
    message: error?.message || 'Failed to open customer portal. Please try again.',
    action: 'Try again or contact support'
  };
}

/**
 * Show error toast with retry functionality
 */
export function showPaymentErrorToast(
  error: any, 
  context: 'checkout' | 'portal',
  onRetry?: () => void
): void {
  const errorInfo = context === 'checkout' 
    ? getCheckoutErrorMessage(error)
    : getPortalErrorMessage(error);
  
  toast.error(errorInfo.title, {
    description: errorInfo.message,
    duration: errorInfo.duration || 6000,
    action: onRetry ? {
      label: 'Retry',
      onClick: onRetry
    } : undefined
  });
}

/**
 * Validate payment requirements before processing
 */
export function validatePaymentRequirements(user: any, plan: any): string | null {
  if (!user) {
    return 'Please log in to continue with your subscription.';
  }
  
  if (!plan?.stripe_price_id) {
    return 'This plan is not available for purchase at this time. Please contact support.';
  }
  
  if (!plan?.id) {
    return 'Invalid plan selected. Please refresh the page and try again.';
  }
  
  return null; // No validation errors
}

/**
 * Format Stripe error for logging while keeping user data private
 */
export function formatErrorForLogging(error: any, context: string): object {
  return {
    context,
    type: error?.type || 'unknown',
    code: error?.code || 'unknown',
    message: error?.message || 'Unknown error',
    timestamp: new Date().toISOString(),
    // Don't log sensitive user data
    hasUserData: !!error?.user_id
  };
}