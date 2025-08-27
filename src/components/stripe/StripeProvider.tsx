import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import type { ReactNode } from 'react';

interface StripeProviderProps {
  children: ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  return (
    <Elements stripe={stripePromise}>
      {children}
    </Elements>
  );
}